import { supabase } from "@/lib/supabaseClient";

export interface UserProfile {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    name_change_count: number;
    name_change_window_start: string | null;
    updated_at: string;
}

const RENAME_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_RENAMES_PER_WINDOW = 3;

/**
 * Fetch a user's profile from the `profiles` table.
 * Creates an empty default profile row if one does not exist yet.
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            if (error.message.includes("JWT issued at future")) {
                // PostgREST rejects the token because its `iat` claim is
                // later than PostgREST's own clock. This is a clock-skew
                // problem, not a bug in this query — it means the client
                // (or whichever machine minted the token) has a system
                // clock that's ahead of the Supabase project's server
                // time. No amount of retrying or re-fetching the profile
                // fixes it; the system clock needs to be corrected /
                // resynced (e.g. re-enable automatic time sync).
                console.error(
                    "[Profile] fetchUserProfile error: JWT issued-at is ahead of the server's clock. " +
                        "This machine's system clock is likely out of sync — check that automatic " +
                        "date/time sync is enabled and correct, then sign in again.",
                );
                return null;
            }
            console.error("[Profile] fetchUserProfile error:", error.message);
            return null;
        }

        if (!data) {
            // Upsert initial profile row
            const initial: UserProfile = {
                user_id: userId,
                display_name: null,
                avatar_url: null,
                name_change_count: 0,
                name_change_window_start: null,
                updated_at: new Date().toISOString(),
            };

            const { data: created, error: createError } = await supabase
                .from("profiles")
                .upsert(initial, { onConflict: "user_id" })
                .select()
                .single();

            if (createError) {
                console.error("[Profile] Failed to create initial profile:", createError.message);
                return initial;
            }

            return created as UserProfile;
        }

        return data as UserProfile;
    } catch (err) {
        console.error("[Profile] Unexpected error fetching profile:", err);
        return null;
    }
}

/**
 * Update display name with rolling 1-hour rate limiting (max 3 edits/hour).
 */
export async function updateDisplayName(
    userId: string,
    newName: string
): Promise<
    | { ok: true; profile: UserProfile }
    | { ok: false; error: string; remainingChanges?: number; retryAfterMs?: number }
> {
    const trimmed = newName.trim();
    if (!trimmed) {
        return { ok: false, error: "Display name cannot be empty." };
    }

    const currentProfile = await fetchUserProfile(userId);
    const now = Date.now();
    const windowStartMs = currentProfile?.name_change_window_start
        ? new Date(currentProfile.name_change_window_start).getTime()
        : 0;

    let nextCount = (currentProfile?.name_change_count ?? 0);
    let nextWindowStart = currentProfile?.name_change_window_start ?? null;

    if (!windowStartMs || now - windowStartMs >= RENAME_WINDOW_MS) {
        // Window expired or never started — reset window
        nextCount = 1;
        nextWindowStart = new Date(now).toISOString();
    } else if (nextCount < MAX_RENAMES_PER_WINDOW) {
        // Within window, increment count
        nextCount += 1;
    } else {
        // Rate limit reached (3 edits within 1 hour)
        const retryAfterMs = RENAME_WINDOW_MS - (now - windowStartMs);
        const minutesLeft = Math.ceil(retryAfterMs / (60 * 1000));
        return {
            ok: false,
            error: `You've reached the name change limit (3 per hour). Try again in ${minutesLeft} minute(s).`,
            remainingChanges: 0,
            retryAfterMs,
        };
    }

    const updatedData: Partial<UserProfile> = {
        user_id: userId,
        display_name: trimmed,
        name_change_count: nextCount,
        name_change_window_start: nextWindowStart,
        updated_at: new Date(now).toISOString(),
    };

    const { data: updated, error } = await supabase
        .from("profiles")
        .upsert(updatedData, { onConflict: "user_id" })
        .select()
        .single();

    if (error) {
        return { ok: false, error: `Failed to update name: ${error.message}` };
    }

    return { ok: true, profile: updated as UserProfile };
}

/**
 * Upload profile photo to Supabase Storage "avatars" bucket.
 */
export async function uploadAvatar(
    userId: string,
    file: File
): Promise<{ ok: true; avatarUrl: string; profile: UserProfile } | { ok: false; error: string }> {
    // 1. Client-side validation: Max file size 5MB
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { ok: false, error: "File size exceeds 5MB limit." };
    }

    // 2. Validate image format
    // 2. Validate image format
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/heic",
        "image/heif",
    ];
    if (!allowedTypes.includes(file.type)) {
        return { ok: false, error: "Only JPG, PNG, WebP, AVIF, and HEIC/HEIF images are allowed." };
    }

    try {
        const fileExt = file.name.split(".").pop() || "png";
        const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            console.error("[Profile] Storage upload error:", uploadError.message);
            return { ok: false, error: `Upload failed: ${uploadError.message}` };
        }

        const { data: { publicUrl } } = supabase.storage
            .from("avatars")
            .getPublicUrl(filePath);

        const { data: updatedProfile, error: profileError } = await supabase
            .from("profiles")
            .upsert(
                {
                    user_id: userId,
                    avatar_url: publicUrl,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" }
            )
            .select()
            .single();

        if (profileError || !updatedProfile) {
            return { ok: false, error: `Profile update failed: ${profileError?.message}` };
        }

        return { ok: true, avatarUrl: publicUrl, profile: updatedProfile as UserProfile };
    } catch (err) {
        console.error("[Profile] Upload avatar exception:", err);
        return { ok: false, error: "Unexpected error during photo upload." };
    }
}

/**
 * Remove custom profile avatar photo.
 */
export async function removeAvatar(userId: string): Promise<UserProfile | null> {
    try {
        const { data: updated, error } = await supabase
            .from("profiles")
            .upsert(
                {
                    user_id: userId,
                    avatar_url: null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" }
            )
            .select()
            .single();

        if (error) {
            console.error("[Profile] removeAvatar error:", error.message);
            return null;
        }

        return updated as UserProfile;
    } catch (err) {
        console.error("[Profile] removeAvatar exception:", err);
        return null;
    }
}
