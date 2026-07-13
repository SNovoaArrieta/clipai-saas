import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { SupabaseIdentityVerifier } from './identity/supabase-identity-verifier.js';

const env = loadEnv();
const identityVerifier =
  env.authMode === 'supabase'
    ? new SupabaseIdentityVerifier({
        supabaseUrl: env.supabaseUrl,
        audience: env.supabaseJwtAudience,
      })
    : undefined;
const app = createApp(
  identityVerifier === undefined ? {} : { identityVerifier },
);

app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port} in ${env.nodeEnv} mode.`);
});
