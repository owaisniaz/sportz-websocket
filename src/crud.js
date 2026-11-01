import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "./db.js";
import { demoUsers } from "./schema.js";

async function main() {
  const email = `admin-${randomUUID()}@example.com`;

  try {
    console.log("Performing CRUD operations...");

    const [newUser] = await db
      .insert(demoUsers)
      .values({ name: "Admin User", email })
      .returning();

    if (!newUser) {
      throw new Error("Failed to create user");
    }
    console.log("CREATE:", newUser);

    const [foundUser] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, newUser.id));
    if (!foundUser) {
      throw new Error("Failed to read created user");
    }
    console.log("READ:", foundUser);

    const [updatedUser] = await db
      .update(demoUsers)
      .set({ name: "Super Admin" })
      .where(eq(demoUsers.id, newUser.id))
      .returning();
    if (!updatedUser) {
      throw new Error("Failed to update user");
    }
    console.log("UPDATE:", updatedUser);

    const [deletedUser] = await db
      .delete(demoUsers)
      .where(eq(demoUsers.id, newUser.id))
      .returning();
    if (!deletedUser) {
      throw new Error("Failed to delete user");
    }
    console.log("DELETE: user deleted");

    console.log("CRUD operations completed successfully.");
  } finally {
    await pool.end();
    console.log("Database pool closed.");
  }
}

main().catch((error) => {
  console.error("Error performing CRUD operations:", error);
  process.exitCode = 1;
});
