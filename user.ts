import * as R from "ramda";
import * as request from "request";
import * as jwt from "jsonwebtoken";
import * as db from "./db";
import logger from "./logger";
import { Preferences, PushNotificationEvents, User } from "./types";

const GOOGLE_OAUTH_SECRET = process.env.GOOGLE_OAUTH_SECRET;

export const defaultPreferences = (): Preferences => ({
  push: {
    subscriptions: [],
    events: [],
  },
});

export const login = (req, res, next) => {
  const network = req.params.network;
  getProfile(network, req.body, req.headers.origin + "/")
    .then(profile => {
      logger.debug("login", profile.id);
      return db
        .getUserFromAuthorization(network, profile.id)
        .then(user => {
          if (user) {
            return user;
          }
          return db.createUser(
            network,
            profile.id,
            profile.name,
            profile.email,
            profile.picture,
            profile
          );
        })
        .then(user => {
          const token = jwt.sign(JSON.stringify(user), process.env.JWT_SECRET!);
          res.sendRaw(200, token);
          next();
        });
    })
    .catch(e => {
      logger.error("login error", e.toString());
      next(e);
    });
};

export const addLogin = (req, res, next) => {
  const network = req.params.network;
  getProfile(network, req.body, req.headers.origin + "/")
    .then(profile => {
      logger.debug("addlogin", profile);
      return db
        .getUserFromAuthorization(network, profile.id)
        .then(user => {
          if (user) {
            throw new Error("already registered");
          }
          db.getUser(req.user.id);
          return db.addNetwork(req.user.id, network, profile.id, profile);
        })
        .then(user => {
          const token = jwt.sign(JSON.stringify(user), process.env.JWT_SECRET!);
          res.sendRaw(200, token);
          next();
        });
    })
    .catch(e => {
      console.error("login error", e.toString());
      res.send(
        403,
        "Already registered for another user. Logout and login again."
      );
      next();
    });
};

const getProfile = (network, code, referer): Promise<any> => {
  return new Promise((resolve, reject) => {
    const options = {
      [db.NETWORK_GOOGLE]: {
        url: "https://www.googleapis.com/oauth2/v4/token",
        form: {
          code: code,
          client_id:
            "1000163928607-54qf4s6gf7ukjoevlkfpdetepm59176n.apps.googleusercontent.com",
          client_secret: GOOGLE_OAUTH_SECRET,
          scope: ["email", "profile"],
          grant_type: "authorization_code",
          redirect_uri: referer,
        },
      },
      [db.NETWORK_REDDIT]: {
        url: "https://www.reddit.com/api/v1/access_token",
        form: {
          code: code,
          scope: ["identity"],
          grant_type: "authorization_code",
          redirect_uri: referer,
        },
        auth: {
          username: "FjcCKkabynWNug",
          password: "TaKLR_955KZuWSF0GwkvZ2Wmeic",
        },
      },
    }[network];
    request(Object.assign({ method: "POST" }, options), function(
      err,
      response,
      body
    ) {
      if (err) {
        return reject(err);
      } else if (response.statusCode !== 200) {
        logger.error(
          "could not get access_token",
          code,
          referer,
          body.toString()
        );
        return reject(new Error(`token request status ${response.statusCode}`));
      }
      var json = JSON.parse(body);
      request(
        {
          url: {
            [db.NETWORK_GOOGLE]: "https://www.googleapis.com/userinfo/v2/me",
            [db.NETWORK_REDDIT]: "https://oauth.reddit.com/api/v1/me",
          }[network],
          method: "GET",
          headers: {
            "User-Agent": "webapp:qdice.wtf:v1.0",
            Authorization: json.token_type + " " + json.access_token,
          },
        },
        function(err, response, body) {
          if (err) {
            return reject(err);
          } else if (response.statusCode !== 200) {
            console.error(body);
            return reject(new Error(`profile ${response.statusCode}`));
          }
          const profile = JSON.parse(body);
          resolve(profile);
        }
      );
    });
  });
};

export const me = function(req, res, next) {
  db.getUser(req.user.id)
    .then(profile => {
      const token = jwt.sign(JSON.stringify(profile), process.env.JWT_SECRET!);
      res.send(200, [profile, token]);
      next();
    })
    .catch(e => next(e));
};

export const profile = function(req, res, next) {
  db.updateUser(req.user.id, req.body.name, req.body.email)
    .then(profile => {
      const token = jwt.sign(JSON.stringify(profile), process.env.JWT_SECRET!);
      res.sendRaw(200, token);
      next();
    })
    .catch(e => {
      console.error(e);
      return Promise.reject(e);
    })
    .catch(e => next(e));
};

export const register = function(req, res, next) {
  db.createUser(db.NETWORK_PASSWORD, null, req.body.name, null, null, null)
    .then(profile => {
      const token = jwt.sign(JSON.stringify(profile), process.env.JWT_SECRET!);
      res.sendRaw(200, token);
      next();
    })
    .catch(e => next(e));
};

export const del = function(req, res, next) {
  db.deleteUser(req.user.id)
    .then(_ => {
      res.send(200);
      next();
    })
    .catch(e => next(e));
};

export const addPushSubscription = (req, res, next) => {
  const subscription = req.body;
  const user: User = (req as any).user;
  logger.debug("register push endpoint", subscription, user.id);
  db.updateUserPreferences(user.id, {
    ...user.preferences,
    push: {
      ...user.preferences.push,
      subscriptions: user.preferences.push.subscriptions.concat(subscription),
    },
  })
    .then(profile => {
      const token = jwt.sign(JSON.stringify(profile), process.env.JWT_SECRET!);
      res.sendRaw(200, token);
    })
    .catch(e => {
      console.error(e);
      return Promise.reject(e);
    })
    .catch(e => next(e));
};

export const addPushEvent = (add: boolean) => (req, res, next) => {
  const event = req.body;
  const user: User = (req as any).user;
  logger.debug("register push event", event, user.id);
  db.updateUserPreferences(user.id, {
    ...user.preferences,
    push: {
      ...user.preferences.push,
      events: add
        ? user.preferences.push.events.concat(event)
        : user.preferences.push.events.filter(e => e !== event),
    },
  })
    .then(profile => {
      const token = jwt.sign(JSON.stringify(profile), process.env.JWT_SECRET!);
      res.sendRaw(200, token);
    })
    .catch(e => {
      console.error(e);
      return Promise.reject(e);
    })
    .catch(e => next(e));
};
