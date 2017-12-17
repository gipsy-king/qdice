const R = require('ramda');

const maps = require('./maps');
const { rand, diceRoll } = require('./rand');

const keys = ['Melchor', 'Miño', 'Sabicas'];
module.exports.keys = keys;

const T_CLIENTS = 'clients';

const STATUS_PAUSED = 'PAUSED';
const STATUS_PLAYING = 'PLAYING';
const STATUS_FINISHED = 'FINISHED';

const TURN_SECONDS = 10;

const Table = name => ({
  name,
  players: [],
  playerSlots: 2,
  status: STATUS_PAUSED,
  turnIndex: -1,
  turnStarted: 0,
  lands: [],
  stackSize: 4,
});


const loadLands = table => {
  table.lands = maps.loadMap(table.name);
  return table;
};

const Player = user => ({
  id: user.id,
  name: user.name,
  picture: user.picture || '',
  color: -1,
  reserveDice: 0,
  derived: {
    connectedLands: 0,
    totalLands: 0,
    currentDice: 0,
  },
});
  
const tables = keys.map(key =>loadLands(Table(key)));
tables[2].playerSlots = 3;
const tableTimeouts = keys.reduce((obj, key) => Object.assign(obj, { [key]: null }));

const findTable = tables => name => tables.filter(table => table.name === name).pop();
const findLand = lands => emoji => lands.filter(land => land.emoji === emoji).pop();

module.exports.getTables = function() {
  return tables;
};

module.exports.command = function(req, res, next) {
  const table = findTable(tables)(req.context.tableName);
  if (!table) {
		return next(new Error('table not found: ' + req.context.tableName));
	}
  const command = req.context.command;
  switch (command) {
    case 'Enter':
      enter(req.user, table, res, next);
      break;
    case 'Join':
      join(req.user, table, res, next);
      break;
    case 'Leave':
      leave(req.user, table, res, next);
      break;
    case 'Attack':
      attack(req.user, table, req.body, res, next);
      break;
    case 'EndTurn':
      endTurn(req.user, table, res, next);
      break;
    default:
      return next(new Error('Unknown command: ' + command));
  }
};

const enter = (user, table, res, next) => {
  const player = Player(user);
  // TODO: publish only to client
  publishTableStatus(table);
  res.send(204);
  next();
};

const join = (user, table, res, next) => {
  if (table.status === STATUS_PLAYING) {
    res.send(406);
    return next();
  }
  const existing = table.players.filter(p => p.id === user.id).pop();
  if (existing) {
    return next(new Error('already joined'));
  } else {
    table.players.push(Player(user));
  }

  if (table.players.length === table.playerSlots) {
    startGame(table);
  } else {
    publishTableStatus(table);
  }
  res.send(204);
  next();
};


const leave = (user, table, res, next) => {
  const existing = table.players.filter(p => p.id === user.id).pop();
  if (!existing) {
    return next(new Error('not joined'));
  } else {
    table.players = table.players.filter(p => p !== existing);
  }
  publishTableStatus(table);
  res.send(204);
  next();
};

const attack = (user, table, [emojiFrom, emojiTo], res, next) => {
  if (table.status !== STATUS_PLAYING) {
    return next(new Error('game not running'));
  }
  const find = findLand(table.lands);
  const fromLand = find(emojiFrom);
  const toLand = find(emojiTo);
  if (!fromLand || !toLand) {
    return next(new Error('land not found'));
  }

  table.turnStarted = Math.floor(Date.now() / 1000);
  setTimeout(() => {
    try {
      const [fromRoll, toRoll, isSuccess] = diceRoll(fromLand.points, toLand.points);
      console.log('rolled');
      if (isSuccess) {
        const loser = R.find(R.propEq('color', toLand.color), table.players);
        toLand.points = fromLand.points - 1;
        toLand.color = fromLand.color;
        if (loser && R.filter(R.propEq('color', loser.color), table.lands).length === 0) {
          table.players = table.players.filter(R.complement(R.equals(loser)));
          console.log('player lost:', loser);
          if (table.players.length === 1) {
            table.players = [];
            table.status = STATUS_FINISHED;
            table.turnIndex = -1;
          }
        }
      }
      fromLand.points = 1;

      console.log('publish roll and table');
      publishRoll(table, {
        from: { emoji: emojiFrom, roll: fromRoll },
        to: { emoji: emojiTo, roll: toRoll },
      });

      table.turnStarted = Math.floor(Date.now() / 1000);
      publishTableStatus(table);
    } catch (e) {
      console.error(e);
    }
  }, 500);
  console.log('rolling...');
  publishTableStatus(table);
  res.send(204);
  next();
};

const endTurn = (user, table, res, next) => {
  if (table.status !== STATUS_PLAYING) {
    return next(new Error('game not running'));
  }
  const existing = table.players.filter(p => p.id === user.id).pop();
  if (!existing) {
    return next(new Error('not playing'));
  }

  if (table.players.indexOf(existing) !== table.turnIndex) {
    return next(new Error('not your turn'));
  }

  nextTurn(table);
  publishTableStatus(table);
  res.send(204);
  next();
};


let client;
module.exports.setMqtt = client_ => {
  client = client_;
  client.on('message', (topic, message) => {
    if (topic.indexOf('tables/') !== 0) return;
    const [ _, tableName, channel ] = topic.split('/');
    const table = findTable(tables)(tableName);
    if (!table) throw new Error('table not found: ' + tableName);
    const { type, payload } = JSON.parse(message);
    //publishTableStatus(table);
  });
  tables.forEach(publishTableStatus);
};

const publishTableStatus = table => {
  client.publish('tables/' + table.name + '/clients',
    JSON.stringify({
      type: 'update',
      payload: serializeTable(table),
    }),
    undefined,
    (err) => {
			if (err) {
				console.log(err, 'tables/' + table.name + '/clients update', table);
			}
		}
  );
};

const serializeTable = module.exports.serializeTable = table => {
  const derived = computePlayerDerived(table);
  return Object.assign({}, table, {
    players: table.players.map(player => Object.assign({}, player, { derived: derived(player) })),
    lands: table.lands.map(R.pick(['emoji', 'color', 'points'])),
  });
};

const computePlayerDerived = table => player => {
  const lands = table.lands.filter(R.propEq('color', player.color));
  const connectedLands = maps.countConnectedLands(table.lands)(player.color);
  return {
    connectedLands,
    totalLands: lands.length,
    currentDice: R.sum(lands.map(R.prop('points'))),
  };
};

const publishRoll = (table, roll) => {
  client.publish('tables/' + table.name + '/clients',
    JSON.stringify({
      type: 'roll',
      payload: roll,
    }),
    undefined,
    (err) => {
			if (err) {
				console.log(err, 'tables/' + table.name + '/clients roll', roll);
			}
		}
  );
};

const startGame = table => {
  table.status = STATUS_PLAYING;
  table.players = table.players
    .map((player, index) => Object.assign({}, player, { color: index + 1 }));

  table.lands = table.lands.map(land => Object.assign({}, land, {
    points: ((r) => {
      if (r > 0.98)
        return Math.min(8, table.stackSize + 1);
      else if (r > 0.90)
        return table.stackSize;
      return rand(1, table.stackSize - 1);
    })(Math.random()),
    color: -1,
  }));
  const startLands = (() => {
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    return shuffle(table.lands.slice()).slice(0, table.players.length);
  })();
  table.players.forEach((player, index) => {
    const land = startLands[index];
    land.color = player.color;
    land.points = 4;
  });
  
  table = nextTurn(table);
  publishTableStatus(table);
  return table;
};

const nextTurn = table => {
  if (table.turnIndex !== -1) {
    const currentTurnPlayer = table.players[table.turnIndex];
    const playerLands = table.lands.filter(land => land.color === currentTurnPlayer.color);
    const newDies =
      maps.countConnectedLands(table.lands)(currentTurnPlayer.color)
      + currentTurnPlayer.reserveDice;
    currentTurnPlayer.reserveDice = 0;

    R.range(0, newDies).forEach(i => {
      const targets = playerLands.filter(land => land.points < 8);
      if (targets.length === 0) {
        currentTurnPlayer.reserveDice += 1;
      } else {
        const target = targets[rand(0, targets.length - 1)];
        target.points += 1;
      }
    });
  }

  const nextIndex = (i => i + 1 < table.playerSlots ? i + 1 : 0)(table.turnIndex);
  table.turnIndex = nextIndex;
  table.turnStarted = Math.floor(Date.now() / 1000);
  return table;
};

let globalTablesUpdate = null;
module.exports.tick = () => {
  tables.filter(table => table.status === STATUS_PLAYING)
    .forEach(table => {
    if (table.turnStarted < Date.now() / 1000 - TURN_SECONDS) {
      nextTurn(table);
      publishTableStatus(table);
    }
  });

  const newUpdate = require('./global').getTablesStatus(tables);
  if (!R.equals(newUpdate)(globalTablesUpdate)) {
    globalTablesUpdate = newUpdate;
    client.publish('clients',
      JSON.stringify({
        type: 'tables',
        payload: globalTablesUpdate,
      }),
      undefined,
      (err) => {
        if (err) {
          console.log(err, 'clients tables');
        }
      }
    );
  }
};

