import UrlPath from "./types/url-path";

const apiBasePath = process.env.API_BASE_PATH ?? "/";
// When running in the console, we have to prepend the console-determine plugin API path to reach our backend.
const apiRootPath = apiBasePath + "api/v1";

const Root = new UrlPath(undefined, apiRootPath);
const Health = new UrlPath(Root, "/health");

const Auth = new UrlPath(Root, "/auth");
const Login = new UrlPath(Auth, "/login");
const LoginStatus = new UrlPath(Login, "/status");
// Must match helm chart value which passes callback URL env var to the pod
const OAuthCallback = new UrlPath(Auth, "/callback");

const Setup = new UrlPath(Root, "/setup");
const CreatingApp = new UrlPath(Setup, "/creating-app");
const SetCreateAppState = new UrlPath(CreatingApp, "/state");
// const SaveApp = new UrlPath(Setup, "/save-app");
const PostCreateApp = new UrlPath(Setup, "/post-create-app");
const PreInstallApp = new UrlPath(Setup, "/pre-install-app");
const PostInstallApp = new UrlPath(Setup, "/post-install-app");

const App = new UrlPath(Root, "/app");
const AppsExisting = new UrlPath(App, "/exists");
const AppRepos = new UrlPath(App, "/repos");
const RepoSecrets = new UrlPath(AppRepos, "/secrets");
const RepoSecretDefaults = new UrlPath(RepoSecrets, "/defaults");
const Workflows = new UrlPath(App, "/workflows");

const Cluster = new UrlPath(Root, "/cluster");

const User = new UrlPath(Root, "/user");
const UserGitHubInfo = new UrlPath(User, "/github");
// const SetUserOAuthState = new UrlPath(User, "/oauth/state");
// const PostUserOAuth = new UrlPath(User, "/oauth/post-redirect");
const UserApp = new UrlPath(User, "/app");
const UserImageRegistries = new UrlPath(User, "/image-registries");
// const ServiceAccount = new UrlPath(User, "/serviceaccount");

const Webhook = new UrlPath(Root, "/webhook");

const ApiEndpoints = {
  Root,
  Health,
  Auth: {
    Login,
    LoginStatus,
    OAuthCallback,
  },
  Setup: {
    Root: Setup,
    SetCreateAppState,
    CreatingApp,
    // SaveApp,
    PostCreateApp,
    PreInstallApp,
    PostInstallApp,
  },
  User: {
    Root: User,
    UserGitHubInfo,
    // SetUserOAuthState,
    // PostUserOAuth,
    App: UserApp,
    ImageRegistries: UserImageRegistries,
    // ServiceAccount,
  },
  App: {
    Root: App,
    Existing: AppsExisting,
    Repos: {
      Root: AppRepos,
      Secrets: RepoSecrets,
      RepoSecretDefaults,
    },
    Workflows,
  },
  Cluster: {
    Root: Cluster,
  },
  Webhook,
};

export default ApiEndpoints;
