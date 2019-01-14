import * as R from 'ramda';

import * as maps from '../maps';
import { groupedPlayerPositions, positionScore, tablePoints } from '../helpers';

export const serializeTable = table => {

  const players = table.players.map(serializePlayer(table));  

  const lands = table.lands.map(({ emoji, color, points }) => [emoji, color, points]);

  const result = Object.assign({}, R.pick([
    'tag', 'name', 'mapName', 'playerSlots', 'status', 'turnIndex', 'turnStarted', 'gameStart',
    'turnCount', 'roundCount',
  ])(table), {
    players: players,
    lands,
    canFlag: table.roundCount >= table.noFlagRounds,
    watchCount: table.watching.length,
  });
  return result;
};


export const serializePlayer = table => {
  const derived = computePlayerDerived(table);
  return player => {
    return Object.assign({}, R.pick([
      'id', 'name', 'picture', 'color', 'reserveDice', 'out', 'outTurns', 'points', 'level', 'score', 'flag',
    ])(player), { derived: derived(player) });
  };
};

const computePlayerDerived = table => {
  const positions = groupedPlayerPositions(table);
  const getScore = positionScore(tablePoints(table))(table.playerStartCount);
  return player => {
    const lands = table.lands.filter(R.propEq('color', player.color));
    const connectedLands = maps.countConnectedLands(table)(player.color);
    const position = positions(player);
    if (typeof (player.score + getScore(position)) !== 'number') {
      console.error(player.score, position, getScore(position));
      throw new Error('undef score');
    }
    return {
      connectedLands,
      totalLands: lands.length,
      currentDice: R.sum(lands.map(R.prop('points'))),
      position,
      score: player.score + getScore(position),
    };
  };
};

