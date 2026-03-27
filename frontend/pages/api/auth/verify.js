import { supabase } from "../../../lib/supabaseClient";

export default async function handler(req, res) {
  const { email, code } = req.body;

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "signup",
  });

  if (error) return res.status(400).json({ error: error.message });

  res.status(200).json({ message: "Email verified" });
}
