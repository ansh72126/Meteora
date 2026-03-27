// route.js
import { supabase } from '../../../../../lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    console.log("Profile route called");

    // 1️⃣ Check Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.log("No auth header sent");
      return NextResponse.json({ username: null });
    }

    console.log("Authorization header received:", authHeader);
    const token = authHeader.replace("Bearer ", "");

    // 2️⃣ Get user using Supabase auth
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError) {
      console.error("Error getting user:", userError);
      return NextResponse.json({ username: null, error: userError.message });
    }

    if (!user) {
      console.log("No user found with this token");
      return NextResponse.json({ username: null });
    }

    console.log("Logged-in user:", user);

    // 3️⃣ Fetch username from profiles table
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile:", error.message);
      return NextResponse.json({ username: null, error: error.message });
    }

    console.log("Profile data fetched:", data);

    const username = data?.username || null;
    console.log("Returning username:", username);

    return NextResponse.json({ username });

  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ username: null, error: String(err) });
  }
}

