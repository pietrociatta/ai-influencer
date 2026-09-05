export const config = {
  aws: {
    region: process.env.AWS_REGION ?? "eu-west-1",
  },

  x: {
    /** "k=v; k=v" string — must include auth_token and ct0. */
    sessionCookie: process.env.X_SESSION_COOKIE ?? "",
    /** Optional: load cookies from Secrets Manager in cloud. */
    sessionSecretArn: process.env.X_SESSION_SECRET_ARN ?? "",
  },
} as const
