import * as R from "ramda";
import {
  Table,
  User,
  Persona,
  Player,
  BotPlayer,
  BotState,
  BotStrategy,
  Color,
  Command,
} from "../types";
import { havePassed } from "../timestamp";
import { shuffle, rand } from "../rand";
import logger from "../logger";
import { BOT_DEADLOCK_MAX } from "../constants";
import { isBorder } from "../maps";
import { findLand, groupedPlayerPositions } from "../helpers";
import { move, Source } from "./bot_strategies";

const defaultPersona: Persona = {
  name: "Personality",
  picture: "assets/bots/bot_profile_picture.svg",
  strategy: "RandomCareful",
  state: {
    deadlockCount: 0,
    lastAgressor: null,
  },
};

export const mkBot = (
  name: string,
  strategy: BotStrategy,
  picture?: string
): Persona => ({
  ...defaultPersona,
  name,
  strategy,
  picture: picture ?? defaultPersona.picture,
});
const personas: Persona[] = [
  mkBot("Alexander", "Revengeful", "assets/bots/bot_alexander.png"),
  mkBot("Augustus", "TargetCareful", "assets/bots/bot_caesar.png"),
  mkBot("Ioseb", "RandomCareless", "assets/bots/bot_ioseb.png"),
  mkBot("Napoleon", "ExtraCareful", "assets/bots/bot_napoleon.png"),
  mkBot("Franco", "ExtraCareful", "assets/bots/bot_franco.png"),
  mkBot("Adolf", "RandomCareless", "assets/bots/bot_adolf.png"),
  mkBot("Benito", "RandomCareless", "assets/bots/bot_benito.png"),
  mkBot("Nikolae", "TargetCareful", "assets/bots/bot_nikolae.png"),
  mkBot("Mao", "TargetCareful", "assets/bots/bot_mao.png"),
  mkBot("Winston", "RandomCareful", "assets/bots/bot_winston.png"),
  mkBot("Genghis", "RandomCareless", "assets/bots/bot_genkhis.png"),
  mkBot("HiroHito", "TargetCareful", "assets/bots/bot_hirohito.png"),
  mkBot("Donald", "RandomCareful", "assets/bots/bot_trump.png"),
  mkBot("Fidel", "ExtraCareful", "assets/bots/bot_fidel.png"),
  mkBot("Vladimir", "RandomCareful", "assets/bots/bot_vladimir.png"),
  mkBot("Kim", "ExtraCareful", "assets/bots/bot_kim.png"),
  mkBot("Idi", "RandomCareful", "assets/bots/bot_idi.png"),
  mkBot("Ramses II", "RandomCareless", "assets/bots/bot_ramses.png"),
];

export const isBot = (player: Player): player is BotPlayer =>
  player.bot !== null;

export const addBots = (table: Table, persona?: Persona): Command => {
  const unusedPersonas = personas.filter(
    p =>
      !R.contains(
        p.name,
        table.players.filter(isBot).map(p => p.name)
      )
  );

  if (typeof persona === "undefined") {
    persona = unusedPersonas[rand(0, unusedPersonas.length - 1)];
  }

  const botUser: User = {
    id: `bot_${persona.name}`,
    name: persona.name,
    picture: persona.picture,
    level: 1,
    levelPoints: 0,
    points: 100,
    rank: 0,
    email: "bot@skynet",
    networks: [],
    claimed: true,
    voted: [],
    awards: [],
  };

  return {
    type: "Join",
    user: botUser,
    clientId: null,
    bot: persona,
  };
};

export const tickBotTurn = (table: Table): Command | undefined => {
  if (!havePassed(0.5, table.turnStart)) {
    return;
  }

  const player = table.players[table.turnIndex];
  if (!isBot(player)) {
    throw new Error("cannot tick non-bot");
  }

  const positions = groupedPlayerPositions(table);
  const position = positions(player);
  if (
    table.players.every(p => p.bot !== null) ||
    player.bot.state.deadlockCount > BOT_DEADLOCK_MAX
  ) {
    if (position > 1) {
      if (player.flag === null || player.flag < position) {
        return { type: "Flag", player };
      } else {
        return { type: "EndTurn", player };
      }
    }
  }
  if (table.roundCount >= 10 && table.players.length === 2 && position === 2) {
    const otherPlayer = table.players.find(
      other => other.color !== player.color
    )!;
    if (
      table.lands.filter(land => land.color === otherPlayer.color).length >=
      table.lands.filter(land => land.color === player.color).length * 0.5
    ) {
      if (player.flag === null || player.flag < position) {
        return { type: "Flag", player };
      }
    }
  }

  const sources = botSources(table, player);

  if (sources.length === 0) {
    return { type: "EndTurn", player };
  }

  const attack = move(player.bot.strategy)(sources, player, table);

  if (attack === null) {
    return { type: "EndTurn", player };
  }

  const emojiFrom = attack.from.emoji;
  const emojiTo = attack.to.emoji; // shuffled random

  return {
    type: "Attack",
    player,
    from: emojiFrom,
    to: emojiTo,
  };
};

const setState = (p: BotPlayer, s: Partial<BotState>): BotPlayer => ({
  ...p,
  bot: {
    ...p.bot,
    state: {
      ...p.bot.state,
      ...s,
    },
  },
});

export const botsNotifyAttack = (table: Table): readonly Player[] =>
  table.players.map<Player>(player => {
    if (
      isBot(player) &&
      findLand(table.lands)(table.attack!.to).color === player.color
    ) {
      const lastAgressor = table.players.find(
        player =>
          player.color === findLand(table.lands)(table.attack!.from).color
      );

      return setState(player, { lastAgressor: lastAgressor?.id ?? null });
    }
    return player;
  });

const botSources = (table: Table, player: Player): Source[] => {
  const otherLands = table.lands.filter(other => other.color !== player.color);
  return shuffle(
    table.lands.filter(land => land.color === player.color && land.points > 1)
  )
    .map(source => ({
      source,
      targets: otherLands.filter(other =>
        isBorder(table.adjacency, source.emoji, other.emoji)
      ),
    }))
    .filter(attack => attack.targets.length > 0);
};

export const tableThemed = (table: Table, player: Player): Player => {
  if (table.tag === "España") {
    return { ...player, ...spanishPersona(player.color) };
  }
  return player;
};

const spanishPersona = (
  color: Color
): { id: string; name: string; picture: string } => {
  const name = spanishName(color);
  const id = `bot_${name}`;
  return {
    id,
    name,
    picture: `assets/bots/bot_${name}.png`,
  };
};

const spanishName = (color: Color): string => {
  switch (color) {
    case Color.Red:
      return "Sánchez";
    case Color.Blue:
      return "Casado";
    case Color.Green:
      return "Abascal";
    case Color.Yellow:
      return "Junqueras";
    case Color.Magenta:
      return "Iglesias";
    case Color.Cyan:
      return "Fantasma de Franco";
    case Color.Orange:
      return "Arrimadas";
    case Color.Beige:
      return "Felipe VI";
    case Color.Black:
      return "N";
    case Color.Neutral:
      return "Neutral";
  }
};
