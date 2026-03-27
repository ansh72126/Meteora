import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body;

  if (!email)
    return res.status(400).json({ error: "Email is required" });

  try {
    // 1. Find the user by email
    const { data: usersData, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (listError)
      return res.status(500).json({ error: listError.message });

    const user = usersData.users.find((u) => u.email === email);

    if (!user)
      return res.status(404).json({ error: "User not found" });

    // 2. Delete from auth.users
    // profiles row is deleted automatically via ON DELETE CASCADE
    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError)
      return res.status(500).json({ error: deleteError.message });

    return res.status(200).json({ message: "Account deleted successfully" });

  } catch (err) {
    return res.status(500).json({ error: "Account deletion failed" });
  }
}