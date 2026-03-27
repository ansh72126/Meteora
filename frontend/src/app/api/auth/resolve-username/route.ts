import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error("listUsers error", error);
      return NextResponse.json({ error: "Failed to resolve username" }, { status: 500 });
    }

    const lower = String(username).toLowerCase();
    const user = data.users.find(
      (u) => String(u.user_metadata?.username || "").toLowerCase() === lower
    );

    if (!user || !user.email) {
      return NextResponse.json({ error: "Username not found" }, { status: 404 });
    }

    return NextResponse.json({ email: user.email });
  } catch (e: any) {
    console.error("resolve-username error", e);
    return NextResponse.json(
      { error: e?.message || "Failed to resolve username" },
      { status: 500 }
    );
  }
}

