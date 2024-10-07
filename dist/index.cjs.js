'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var backendCommon = require('@backstage/backend-common');
var errors = require('@backstage/errors');
var integration = require('@backstage/integration');
var pluginScaffolderBackend = require('@backstage/plugin-scaffolder-backend');
var azdev = require('azure-devops-node-api');
var path = require('path');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var azdev__namespace = /*#__PURE__*/_interopNamespace(azdev);

async function cloneRepo({
  dir,
  auth,
  logger,
  remote = "origin",
  remoteUrl,
  branch = "main"
}) {
  const git = backendCommon.Git.fromAuth({
    ...auth,
    logger
  });
  await git.clone({
    url: remoteUrl,
    dir,
    depth: 1
  });
  await git.addRemote({
    dir,
    remote,
    url: remoteUrl
  });
  await git.checkout({
    dir,
    ref: branch
  });
}
async function commitAndPushBranch({
  dir,
  auth,
  logger,
  remote = "origin",
  commitMessage,
  gitAuthorInfo,
  branch = "scaffolder"
}) {
  var _a, _b;
  const authorInfo = {
    name: (_a = gitAuthorInfo == null ? void 0 : gitAuthorInfo.name) != null ? _a : "Scaffolder",
    email: (_b = gitAuthorInfo == null ? void 0 : gitAuthorInfo.email) != null ? _b : "scaffolder@backstage.io"
  };
  const git = backendCommon.Git.fromAuth({
    ...auth,
    logger
  });
  const currentBranch = await git.currentBranch({ dir });
  if (currentBranch !== branch) {
    await git.branch({
      dir,
      ref: branch
    });
    await git.checkout({
      dir,
      ref: branch
    });
  }
  await git.add({
    dir,
    filepath: "."
  });
  await git.commit({
    dir,
    message: commitMessage,
    author: authorInfo,
    committer: authorInfo
  });
  await git.push({
    dir,
    remote,
    remoteRef: `refs/heads/${branch}`
  });
}
async function createADOPullRequest({
  gitPullRequestToCreate,
  url,
  authHandler,
  repoId,
  project,
  supportsIterations
}) {
  const connection = new azdev__namespace.WebApi(url, authHandler);
  const gitApiObject = await connection.getGitApi();
  await gitApiObject.createPullRequest(
    gitPullRequestToCreate,
    repoId,
    project,
    supportsIterations
  );
}

const cloneAzureRepoAction = (options) => {
  const { integrations } = options;
  return pluginScaffolderBackend.createTemplateAction({
    id: "azure:repo:clone",
    description: "Clone an Azure repository into the workspace directory.",
    schema: {
      input: {
        required: ["remoteUrl"],
        type: "object",
        properties: {
          organization: {
            title: "Organization Name",
            type: "string",
            description: "The name of the organization in Azure DevOps."
          },
          remoteUrl: {
            title: "Remote URL",
            type: "string",
            description: "The Git URL to the repository."
          },
          branch: {
            title: "Repository Branch",
            type: "string",
            description: "The branch to checkout to."
          },
          targetPath: {
            title: "Working Subdirectory",
            type: "string",
            description: "The subdirectory of the working directory to clone the repository into."
          },
          server: {
            type: "string",
            title: "Server hostname",
            description: "The hostname of the Azure DevOps service. Defaults to dev.azure.com"
          },
          token: {
            title: "Authenticatino Token",
            type: "string",
            description: "The token to use for authorization."
          }
        }
      }
    },
    async handler(ctx) {
      var _a, _b, _c, _d;
      const { remoteUrl, branch, server } = ctx.input;
      const targetPath = (_a = ctx.input.targetPath) != null ? _a : "./";
      const outputDir = backendCommon.resolveSafeChildPath(ctx.workspacePath, targetPath);
      const host = server != null ? server : "dev.azure.com";
      const type = (_b = integrations.byHost(host)) == null ? void 0 : _b.type;
      if (!type) {
        throw new errors.InputError(
          `No matching integration configuration for host ${host}, please check your integrations config`
        );
      }
      const organization = (_c = ctx.input.organization) != null ? _c : "notempty";
      const url = `https://${host}/${organization}`;
      const credentialProvider = integration.DefaultAzureDevOpsCredentialsProvider.fromIntegrations(integrations);
      const credentials = await credentialProvider.getCredentials({ url });
      if (credentials === void 0 && ctx.input.token === void 0) {
        throw new errors.InputError(
          `No credentials provided ${url}, please check your integrations config`
        );
      }
      const token = (_d = ctx.input.token) != null ? _d : credentials.token;
      await cloneRepo({
        dir: outputDir,
        auth: { username: "notempty", password: token },
        logger: ctx.logger,
        remoteUrl,
        branch
      });
    }
  });
};

const getRepoSourceDirectory = (workspacePath, sourcePath) => {
  if (sourcePath) {
    const safeSuffix = path.normalize(sourcePath).replace(
      /^(\.\.(\/|\\|$))+/,
      ""
    );
    const path$1 = path.join(workspacePath, safeSuffix);
    if (!backendCommon.isChildPath(workspacePath, path$1)) {
      throw new Error("Invalid source path");
    }
    return path$1;
  }
  return workspacePath;
};

const pushAzureRepoAction = (options) => {
  const { integrations, config } = options;
  return pluginScaffolderBackend.createTemplateAction({
    id: "azure:repo:push",
    description: "Push the content in the workspace to a remote Azure repository.",
    schema: {
      input: {
        required: [],
        type: "object",
        properties: {
          organization: {
            title: "Organization Name",
            type: "string",
            description: "The name of the organization in Azure DevOps."
          },
          branch: {
            title: "Repository Branch",
            type: "string",
            description: "The branch to checkout to."
          },
          sourcePath: {
            type: "string",
            title: "Working Subdirectory",
            description: "The subdirectory of the working directory containing the repository."
          },
          gitCommitMessage: {
            title: "Git Commit Message",
            type: "string",
            description: "Sets the commit message on the repository. The default value is 'Initial commit'"
          },
          gitAuthorName: {
            title: "Default Author Name",
            type: "string",
            description: "Sets the default author name for the commit. The default value is 'Scaffolder'."
          },
          gitAuthorEmail: {
            title: "Default Author Email",
            type: "string",
            description: "Sets the default author email for the commit."
          },
          server: {
            type: "string",
            title: "Server hostname",
            description: "The hostname of the Azure DevOps service. Defaults to dev.azure.com"
          },
          token: {
            title: "Authenticatino Token",
            type: "string",
            description: "The token to use for authorization."
          }
        }
      }
    },
    async handler(ctx) {
      var _a, _b, _c;
      const { branch, gitCommitMessage, gitAuthorName, gitAuthorEmail, server } = ctx.input;
      const sourcePath = getRepoSourceDirectory(
        ctx.workspacePath,
        ctx.input.sourcePath
      );
      const host = server != null ? server : "dev.azure.com";
      const type = (_a = integrations.byHost(host)) == null ? void 0 : _a.type;
      if (!type) {
        throw new errors.InputError(
          `No matching integration configuration for host ${host}, please check your integrations config`
        );
      }
      const organization = (_b = ctx.input.organization) != null ? _b : "notempty";
      const url = `https://${host}/${organization}`;
      const credentialProvider = integration.DefaultAzureDevOpsCredentialsProvider.fromIntegrations(integrations);
      const credentials = await credentialProvider.getCredentials({ url });
      if (credentials === void 0 && ctx.input.token === void 0) {
        throw new errors.InputError(
          `No credentials provided ${url}, please check your integrations config`
        );
      }
      const token = (_c = ctx.input.token) != null ? _c : credentials.token;
      const gitAuthorInfo = {
        name: gitAuthorName ? gitAuthorName : config.getOptionalString("scaffolder.defaultAuthor.name"),
        email: gitAuthorEmail ? gitAuthorEmail : config.getOptionalString("scaffolder.defaultAuthor.email")
      };
      await commitAndPushBranch({
        dir: sourcePath,
        auth: { username: "notempty", password: token },
        logger: ctx.logger,
        commitMessage: gitCommitMessage ? gitCommitMessage : config.getOptionalString("scaffolder.defaultCommitMessage") || "Initial commit",
        gitAuthorInfo,
        branch
      });
    }
  });
};

const pullRequestAzureRepoAction = (options) => {
  const { integrations } = options;
  return pluginScaffolderBackend.createTemplateAction({
    id: "azure:repo:pr",
    description: "Create a PR to a repository in Azure DevOps.",
    schema: {
      input: {
        type: "object",
        required: ["repoId", "title"],
        properties: {
          organization: {
            title: "Organization Name",
            type: "string",
            description: "The name of the organization in Azure DevOps."
          },
          sourceBranch: {
            title: "Source Branch",
            type: "string",
            description: "The branch to merge into the source."
          },
          targetBranch: {
            title: "Target Branch",
            type: "string",
            description: "The branch to merge into (default: main)."
          },
          title: {
            title: "Title",
            description: "The title of the pull request.",
            type: "string"
          },
          repoId: {
            title: "Remote Repo ID",
            description: "Repo ID of the pull request.",
            type: "string"
          },
          project: {
            title: "ADO Project",
            description: "The Project in Azure DevOps.",
            type: "string"
          },
          supportsIterations: {
            title: "Supports Iterations",
            description: "Whether or not the PR supports interations.",
            type: "boolean"
          },
          server: {
            type: "string",
            title: "Server hostname",
            description: "The hostname of the Azure DevOps service. Defaults to dev.azure.com"
          },
          token: {
            title: "Authenticatino Token",
            type: "string",
            description: "The token to use for authorization."
          }
        }
      }
    },
    async handler(ctx) {
      var _a, _b, _c, _d, _e;
      const { title, repoId, server, project, supportsIterations } = ctx.input;
      const sourceBranch = (_a = `refs/heads/${ctx.input.sourceBranch}`) != null ? _a : `refs/heads/scaffolder`;
      const targetBranch = (_b = `refs/heads/${ctx.input.targetBranch}`) != null ? _b : `refs/heads/main`;
      const host = server != null ? server : "dev.azure.com";
      const type = (_c = integrations.byHost(host)) == null ? void 0 : _c.type;
      if (!type) {
        throw new errors.InputError(
          `No matching integration configuration for host ${host}, please check your integrations config`
        );
      }
      const pullRequest = {
        sourceRefName: sourceBranch,
        targetRefName: targetBranch,
        title
      };
      const organization = (_d = ctx.input.organization) != null ? _d : "notempty";
      const url = `https://${host}/${organization}`;
      const credentialProvider = integration.DefaultAzureDevOpsCredentialsProvider.fromIntegrations(integrations);
      const credentials = await credentialProvider.getCredentials({ url });
      if (credentials === void 0 && ctx.input.token === void 0) {
        throw new errors.InputError(
          `No credentials provided ${url}, please check your integrations config`
        );
      }
      const authHandler = ctx.input.token || (credentials == null ? void 0 : credentials.type) === "pat" ? azdev.getPersonalAccessTokenHandler((_e = ctx.input.token) != null ? _e : credentials.token) : azdev.getBearerHandler(credentials.token);
      await createADOPullRequest({
        gitPullRequestToCreate: pullRequest,
        url,
        authHandler,
        repoId,
        project,
        supportsIterations
      });
    }
  });
};

exports.cloneAzureRepoAction = cloneAzureRepoAction;
exports.pullRequestAzureRepoAction = pullRequestAzureRepoAction;
exports.pushAzureRepoAction = pushAzureRepoAction;
//# sourceMappingURL=index.cjs.js.map
