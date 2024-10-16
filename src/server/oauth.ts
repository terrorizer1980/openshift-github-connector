import express from "express";
import passport from "passport";
import passportOAuth2, { VerifyCallback } from "passport-oauth2";

import User from "server/lib/user/user";
import ApiEndpoints from "common/api-endpoints";
import Log from "./logger";
import { fetchFromOpenShiftApiServer } from "./util/server-util";
import TokenUtil from "./lib/user/token-util";
import { loadUser } from "./lib/user/user-serializer";
import { UserSessionData } from "./lib/user/server-user-types";

export const OAUTH2_STRATEGY_NAME = "oauth2";
// export const MOCK_STRATEGY_NAME = "mock";

// these must match the container spec
// const OAUTH_SERVER_URL = "OAUTH_SERVER_URL";
const CLIENT_ID_ENVVAR = "OAUTH_CLIENT_ID";
const CLIENT_SECRET_ENVVAR = "OAUTH_CLIENT_SECRET";
const CALLBACK_URL_ENVVAR = "OAUTH_CALLBACK_URL";

interface OAuthServerInfo {
  issuer: string,
  authorization_endpoint: string,
  token_endpoint: string,
  // https://docs.openshift.com/container-platform/4.7/authentication/tokens-scoping.html
  scopes_supported: string[],
  response_types_supported: string[],           // "code" | "token"
  grant_types_supported: string[],              // "authorization_code" | "implicit"
  code_challenge_methods_supported: string[],   // "plain" | "S256"
}

// https://docs.openshift.com/container-platform/4.7/authentication/configuring-internal-oauth.html
const OAUTH_SERVER_PATH = ".well-known/oauth-authorization-server";

let cachedClusterOAuthServerInfo: OAuthServerInfo | undefined;

async function fetchClusterOAuthServerInfo(): Promise<OAuthServerInfo> {
  if (cachedClusterOAuthServerInfo) {
    Log.info(`Using cached cluster OAuth server info`);
    return cachedClusterOAuthServerInfo;
  }

  Log.info(`Fetching cluster OAuth server info from ${OAUTH_SERVER_PATH}`);

  return (await fetchFromOpenShiftApiServer(OAUTH_SERVER_PATH)) as OAuthServerInfo;
}

async function getOAuthStrategyOptions(): Promise<passportOAuth2.StrategyOptions> {
  // if (!isInCluster()) {
  //   throw new Error("Finding the cluster OAuth server outside of the cluster is not implemented");
  // }

  const clientID = process.env[CLIENT_ID_ENVVAR];
  if (!clientID) {
    throw new Error(`Client ID not set in env.${CLIENT_ID_ENVVAR}`);
  }
  Log.info(`Client ID is ${clientID}`);

  const clientSecret = process.env[CLIENT_SECRET_ENVVAR];
  if (!clientSecret) {
    throw new Error(`Client secret not set in env.${CLIENT_SECRET_ENVVAR}`);
  }

  const callbackURL = process.env[CALLBACK_URL_ENVVAR];
  if (!callbackURL) {
    throw new Error(`Callback URL not set in env.${CALLBACK_URL_ENVVAR}`);
  }
  Log.info(`Callback URL is ${callbackURL}`);

  const clusterOAuthServerInfo = await fetchClusterOAuthServerInfo();

  Log.info(`Authorization URL is ${clusterOAuthServerInfo.authorization_endpoint}`);

  // Log.info(`Cluster OAuth server info`, clusterOAuthServerInfo);

  // https://www.passportjs.org/packages/passport-oauth2/
  return {
    authorizationURL: clusterOAuthServerInfo.authorization_endpoint,
    tokenURL: clusterOAuthServerInfo.token_endpoint,
    clientID,
    clientSecret,
    callbackURL,
    state: true,
    pkce: true,
  };
}

export async function setupPassport(app: express.Application): Promise<void> {
  Log.info(`Attaching passport...`);

  Log.info(`Using OpenShift OAuth as authentication strategy`);
  const oauthOptions = await getOAuthStrategyOptions();

  passport.use(OAUTH2_STRATEGY_NAME, new passportOAuth2.Strategy(
    { ...oauthOptions, passReqToCallback: true },
    async (
      req: express.Request,
      accessToken: string,
      _refreshToken: string,
      _profile: Record<string, unknown>,
      done: VerifyCallback
    ) => {

      const now = Date.now();

      Log.info(`OAuth callback received`);

      Log.info(`Access token`, accessToken);

      // empty
      // Log.info(`Req body`, req.body);
      // openshift oauth does not provide a refresh token
      // Log.info(`REFRESH TOKEN`, refreshToken);
      // openshift oauth does not provide a profile
      // Log.info(`PROFILE`, profile);

      try {
        const tokenInfo = await TokenUtil.introspectToken({ accessToken, createdAtEstimate: now });
        const userInfo = await TokenUtil.introspectUser(accessToken);

        const sessionData: UserSessionData = {
          token: tokenInfo,
          info: userInfo,
        };

        req.session.user = sessionData;

        await User.loadOrCreate(sessionData);
        // return done(undefined, sessionData);
        return done(undefined, sessionData);
      }
      catch (err) {
        return done(err);
      }
    }
  ));

  /*
  passport.serializeUser((user: UserSessionData, done: (err: any, session: UserSessionData) => void) => {
    Log.info(`Serialize user ${user.info.uid}`);
    done(undefined, user);
  });

  passport.deserializeUser(async (userData: UserSessionData, done) => {
    Log.debug(`Deserialize user ${userData.info.uid}`);
    return done(undefined, userData);
  });
  */

  app.use(passport.initialize());
  // app.use(passport.session());

  // redirect unauthenticated requests to the login page
  app.use((req, res, next) => {
    const shouldRedirect = shouldAuthRedirect(req);

    if (shouldRedirect.reason) {
      Log.debug(
        `${!shouldRedirect.redirect ? "Not blocking" : "Blocking"} `
        + `${req.path} because ${shouldRedirect.reason}`
      );
    }

    if (shouldRedirect.redirect) {
      // return res.redirect(ApiEndpoints.Auth.Login.path);
      return res.send401();
    }
    return next();
  });

  app.use(getUserOrDie);

  Log.info(`Finished attaching passport`);
}

const getUserOrDie = (req: express.Request, res: express.Response, next: express.NextFunction): void => {

  req.getUserOrDie = async (die: boolean = true): Promise<User | undefined> => {

    if (!req.session.user) {
      if (die) {
        res.send401();
      }
      return undefined;
    }

    Log.debug(`Lookup user ${req.session.user.info.uid}`);

    const user = await loadUser(req.session.user);
    if (!user) {
      Log.debug(`Failed to look up user; clearing session`);
      req.session.user = undefined;

      res.send401();
      return undefined;
    }

    return user;
  };

  next();
};

const ENDPOINTS_NO_AUTH: string[] = [
  ApiEndpoints.Auth.Login.path,
  ApiEndpoints.Auth.LoginStatus.path,
  ApiEndpoints.Auth.OAuthCallback.path,
];
/*
.reduce((aggregator: string[], item) => {
  aggregator.push(item);
  aggregator.push(item + "/");

  return aggregator;
}, []);
*/

function shouldAuthRedirect(req: express.Request): { redirect: boolean, reason?: string } {
  if (req.path.startsWith(ApiEndpoints.Root.path)) {
    if (ENDPOINTS_NO_AUTH.includes(req.path)
      || (req.path.endsWith("/") && ENDPOINTS_NO_AUTH.includes(req.path.substring(0, req.path.length - 1)))
    ) {
      return {
        redirect: false,
        reason: `request path is allowlisted`,
      };
    }

    if (req.session.user == null) {
      return {
        redirect: true,
        reason: `there is no user session`,
      };
    }
    else if (req.session.user.token.expiresAtEstimate <= Date.now()) {
      return {
        redirect: true,
        reason: `user token appears to be expired`,
      };
    }
  }

  return {
    redirect: false,
  };
}
