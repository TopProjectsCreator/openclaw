import type { ProviderAuthContext, OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { buildOauthProviderAuthResult } from "openclaw/plugin-sdk/provider-auth-result";
import type {
  ProviderPlugin,
  ProviderResolveDynamicModelContext,
} from "openclaw/plugin-sdk/provider-model-shared";
import { formatGoogleOauthApiKey } from "./oauth-token-shared.js";
import { GOOGLE_GEMINI_PROVIDER_HOOKS } from "./provider-hooks.js";
import { isModernGoogleModel, resolveGoogleGeminiForwardCompatModel } from "./provider-models.js";

const PROVIDER_ID = "google-antigravity";
const PROVIDER_LABEL = "Antigravity CLI OAuth";
const ENV_VARS = [
  "OPENCLAW_GEMINI_OAUTH_CLIENT_ID",
  "OPENCLAW_GEMINI_OAUTH_CLIENT_SECRET",
  "GEMINI_CLI_OAUTH_CLIENT_ID",
  "GEMINI_CLI_OAUTH_CLIENT_SECRET",
] as const;

let oauthRuntimeModulePromise: Promise<typeof import("./oauth.runtime.js")> | null = null;

const loadOauthRuntimeModule = async () => {
  oauthRuntimeModulePromise ??= import("./oauth.runtime.js");
  return await oauthRuntimeModulePromise;
};

export function buildGoogleAntigravityProvider(): ProviderPlugin {
  return {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    docsPath: "/providers/models",
    aliases: ["antigravity"],
    envVars: [...ENV_VARS],
    auth: [
      {
        id: "oauth",
        label: "Antigravity CLI OAuth",
        hint: "PKCE + localhost callback (reuses Gemini CLI credentials)",
        kind: "oauth",
        run: async (ctx: ProviderAuthContext) => {
          await ctx.prompter.note(
            [
              "This is an unofficial integration and is not endorsed by Google.",
              "The Antigravity OAuth bridge uses the same Google Cloud Code Assist API as Gemini CLI.",
              "Some users have reported account restrictions or suspensions after using third-party OAuth clients.",
              "Proceed only if you understand and accept this risk.",
            ].join("\n"),
            "Antigravity CLI OAuth caution",
          );

          const proceed = await ctx.prompter.confirm({
            message: "Continue with Antigravity CLI OAuth?",
            initialValue: false,
          });
          if (!proceed) {
            await ctx.prompter.note("Skipped Antigravity CLI OAuth setup.", "Setup skipped");
            return { profiles: [] };
          }

          const spin = ctx.prompter.progress("Starting Antigravity CLI OAuth…");
          try {
            const { loginGeminiCliOAuth } = await loadOauthRuntimeModule();
            const result = await loginGeminiCliOAuth({
              isRemote: ctx.isRemote,
              openUrl: ctx.openUrl,
              log: (msg) => ctx.runtime.log(msg),
              note: ctx.prompter.note,
              prompt: async (message) => ctx.prompter.text({ message }),
              progress: spin,
            });

            spin.stop("Antigravity CLI OAuth complete");
            return buildOauthProviderAuthResult({
              providerId: PROVIDER_ID,
              access: result.access,
              refresh: result.refresh,
              expires: result.expires,
              email: result.email,
              ...(result.projectId ? { credentialExtra: { projectId: result.projectId } } : {}),
            });
          } catch (err) {
            spin.stop("Antigravity CLI OAuth failed");
            await ctx.prompter.note(
              "Trouble with OAuth? Ensure your Google account has Cloud Code Assist access.",
              "OAuth help",
            );
            throw err;
          }
        },
      },
    ],
    wizard: {
      setup: {
        choiceId: "google-antigravity",
        choiceLabel: "Antigravity CLI OAuth",
        choiceHint: "Google OAuth via Antigravity bridge (reuses Gemini CLI credentials)",
        methodId: "oauth",
      },
    },
    resolveDynamicModel: (ctx: ProviderResolveDynamicModelContext) =>
      resolveGoogleGeminiForwardCompatModel({
        providerId: PROVIDER_ID,
        ctx,
      }),
    ...GOOGLE_GEMINI_PROVIDER_HOOKS,
    isModernModelRef: ({ modelId }) => isModernGoogleModel(modelId),
    resolveReasoningOutputMode: () => "tagged" as const,
    formatApiKey: (cred) => formatGoogleOauthApiKey(cred),
    refreshOAuth: async (cred) => {
      const { refreshGeminiCliOAuthToken } = await loadOauthRuntimeModule();
      return await refreshGeminiCliOAuthToken(cred);
    },
  };
}

export function registerGoogleAntigravityProvider(api: OpenClawPluginApi) {
  api.registerProvider(buildGoogleAntigravityProvider());
}
