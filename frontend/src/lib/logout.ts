import { supabase } from "./supabase";

export const logoutWithCleanup = async (): Promise<void> => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (token) {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/session/cleanup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    await supabase.auth.signOut();
  } catch (e) {
    console.error(e);
  }

  sessionStorage.removeItem("auth");
  localStorage.removeItem("auth");
  localStorage.removeItem("username");
  localStorage.removeItem("email");
};

