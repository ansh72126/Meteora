import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { email, password, username } = req.body;

  if (!email || !password || !username)
    return res.status(400).json({ error: "All fields required" });

  /* ---------------- EMAIL VALIDATION COMPONENT ---------------- */

  // 1️⃣ Check Email Format
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    // 2️⃣ Check if Email Already Exists in Supabase Auth
    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      return res.status(500).json({ error: usersError.message });
    }

    const emailExists = usersData.users.some(
      (user) => user.email === email
    );

    if (emailExists) {
      return res
        .status(400)
        .json({ error: "Email already registered" });
    }
  } catch (err) {
    return res.status(500).json({ error: "Email check failed" });
  }

  // 1. Create auth user
  const { data, error } = await supabaseAdmin.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,  // store username directly in user_metadata
      },
    },
  });

  if (error) return res.status(400).json({ error: error.message });

  // 2. Store username
  await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    username,
  });

  res.status(200).json({
    username: data.user.user_metadata.username,
    message: "Signup successful. Check your email for OTP.",
  });
}
