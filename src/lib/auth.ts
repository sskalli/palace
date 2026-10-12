import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { db } from "@/lib/db";

const secret = process.env.BETTER_AUTH_SECRET;

if (process.env.NODE_ENV === "production" && !secret) {
  throw new Error("BETTER_AUTH_SECRET must be set in production.");
}

export const auth = betterAuth({
  appName: "Palace",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: secret ?? "palace-development-secret-change-this-32-chars",
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
});
