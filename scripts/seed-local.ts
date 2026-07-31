import "dotenv/config";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "../server/db";
import { companies, users } from "../shared/schema";

const email = process.env.LOCAL_ADMIN_EMAIL;
const password = process.env.LOCAL_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error(
    "LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD must be set before seeding",
  );
}

async function seedLocalAdmin() {
  let [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.name, "Talavera Local"))
    .limit(1);

  if (!company) {
    [company] = await db
      .insert(companies)
      .values({ name: "Talavera Local", plan: "basic" })
      .returning();
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    console.log(`Local administrator already exists: ${email}`);
    return;
  }

  await db.insert(users).values({
    email,
    firstName: "Local",
    lastName: "Admin",
    passwordHash: await hash(password, 12),
    role: "admin",
    companyId: company.id,
    mustChangePassword: false,
  });

  console.log(`Local administrator created: ${email}`);
}

try {
  await seedLocalAdmin();
} finally {
  await closeDatabase();
}
