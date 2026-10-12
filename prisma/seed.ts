import { PrismaClient, FolderKind } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.info("Set SEED_USER_EMAIL to the email of an existing Palace account.");
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No Palace account exists for ${email}. Create one in the app first.`);
  }
  await prisma.folder.createMany({
    data: [{ userId: user.id, name: "Inbox", kind: FolderKind.INBOX }],
    skipDuplicates: true,
  });
  console.info(`Inbox is ready for ${email}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
