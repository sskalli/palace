import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonError, parseJson } from "@/lib/http";
import { registrationSchema } from "@/lib/validation";

export async function POST(request: Request) {
	const data = await parseJson(request, registrationSchema);
	if (!data) return jsonError("Enter a valid email and a password of at least 8 characters.", 400);

	try {
		const passwordHash = await hash(data.password, 12);
		const user = await prisma.user.create({
			data: {
				email: data.email,
				name: data.name || null,
				passwordHash,
			},
			select: { id: true },
		});
		return Response.json({ id: user.id }, { status: 201 });
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
			return jsonError("An account with this email already exists.", 409);
		}
		console.error("Account registration failed", error);
		return jsonError("Account creation failed. Please try again.", 500);
	}
}
