import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
	email: z
		.string()
		.trim()
		.email()
		.max(254)
		.transform((value) => value.toLowerCase()),
	password: z
		.string()
		.min(1)
		.max(72)
		.refine((value) => Buffer.byteLength(value, "utf8") <= 72),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
	session: { strategy: "jwt" },
	pages: { signIn: "/login" },
	providers: [
		Credentials({
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
			},
			async authorize(credentials) {
				const parsed = credentialsSchema.safeParse(credentials);
				if (!parsed.success) return null;

				const user = await prisma.user.findUnique({
					where: { email: parsed.data.email },
					select: { id: true, email: true, name: true, passwordHash: true },
				});
				if (!user || !(await compare(parsed.data.password, user.passwordHash))) return null;
				return { id: user.id, email: user.email, name: user.name };
			},
		}),
	],
	callbacks: {
		jwt({ token, user }) {
			if (user?.id) token.sub = user.id;
			return token;
		},
		session({ session, token }) {
			if (session.user && token.sub) session.user.id = token.sub;
			return session;
		},
	},
});
