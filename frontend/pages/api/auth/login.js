import { supabase } from "../../../lib/supabaseClient";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  const { identifier, password } = req.body;

  let email = identifier;

  // If identifier is username → get email
  if (!identifier.includes("@")) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", identifier)
      .single();

    if (!profile)
      return res.status(400).json({ error: "User not found" });

    const { data: user } = await supabaseAdmin.auth.admin.getUserById(
      profile.id
    );

    email = user.user.email;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  console.log("Login data:", data);
  console.log("Login error:", error);

  if (error) return res.status(400).json({ error: error.message });

  res.status(200).json({username: data.user.user_metadata.username,email: data.user.email, message: "Login successful" });
}
