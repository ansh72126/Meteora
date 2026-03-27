import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { password, access_token } = req.body;

    if (!password || !access_token) {
      return res.status(400).json({ error: "Password and token are required" });
    }

    // Get user from access token
    const { data: { user }, error: sessionError } = await supabase.auth.getUser(access_token);

    if (sessionError || !user) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    // Update password
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: password,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update password" });
  }
}