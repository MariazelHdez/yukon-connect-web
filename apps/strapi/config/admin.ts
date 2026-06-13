export default ({ env }: { env: any }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'replace-me-with-a-secure-admin-jwt-secret'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', 'replace-me-with-a-secure-api-token-salt'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', 'replace-me-with-a-secure-transfer-token-salt'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY', 'replace-me-with-a-secure-32-char-key'),
  },
});
