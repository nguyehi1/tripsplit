// Hand-authored to match supabase/migrations/0001_init.sql. Once a project is linked, regenerate
// with `npx supabase gen types typescript --linked > src/lib/supabase/types.ts` and diff it
// against this file rather than trusting it blindly.

type Relationships = never[];

export type Database = {
  public: {
    Tables: {
      trips: {
        Row: {
          id: string;
          name: string;
          location: string | null;
          starts_on: string | null;
          ends_on: string | null;
          created_by: string;
          invite_code: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["trips"]["Row"]> & { name: string; created_by: string };
        Update: Partial<Database["public"]["Tables"]["trips"]["Row"]>;
        Relationships: Relationships;
      };
      trip_members: {
        Row: {
          id: string;
          trip_id: string;
          user_id: string | null;
          display_name: string;
          joined_at: string;
          is_placeholder: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["trip_members"]["Row"]> & {
          trip_id: string;
          display_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["trip_members"]["Row"]>;
        Relationships: Relationships;
      };
      expenses: {
        Row: {
          id: string;
          trip_id: string;
          paid_by: string;
          amount: number;
          description: string;
          receipt_photo_url: string | null;
          date: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["expenses"]["Row"]> & {
          trip_id: string;
          paid_by: string;
          amount: number;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Row"]>;
        Relationships: Relationships;
      };
      feedback: {
        Row: {
          id: string;
          user_id: string;
          trip_id: string | null;
          rating: "yes" | "fine" | "not_really" | null;
          comment: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["feedback"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["feedback"]["Row"]>;
        Relationships: Relationships;
      };
      shopping_list_items: {
        Row: {
          id: string;
          trip_id: string;
          description: string;
          added_by: string | null;
          claimed_by: string | null;
          status: "open" | "claimed" | "logged";
          expense_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["shopping_list_items"]["Row"]> & {
          trip_id: string;
          description: string;
        };
        // No update grant for `authenticated` (RPC-only writes for every status transition) —
        // kept here only so the generated type shape matches PostgREST's own introspection.
        Update: Partial<Database["public"]["Tables"]["shopping_list_items"]["Row"]>;
        Relationships: Relationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_trip_by_invite_code: {
        Args: { _code: string };
        Returns: {
          trip_id: string;
          name: string;
          location: string | null;
          starts_on: string | null;
          ends_on: string | null;
          is_completed: boolean;
          organizer_name: string | null;
        }[];
      };
      create_trip: {
        Args: {
          _name: string;
          _display_name: string;
          _location?: string | null;
          _starts_on?: string | null;
          _ends_on?: string | null;
        };
        Returns: { trip_id: string; invite_code: string }[];
      };
      join_trip: {
        Args: { _invite_code: string; _display_name: string };
        Returns: string;
      };
      join_trip_by_id: {
        Args: { _trip_id: string; _display_name: string };
        Returns: string;
      };
      complete_trip: {
        Args: { _trip_id: string };
        Returns: undefined;
      };
      add_placeholder_member: {
        Args: { _trip_id: string; _display_name: string };
        Returns: string;
      };
      rename_placeholder_member: {
        Args: { _member_id: string; _display_name: string };
        Returns: undefined;
      };
      remove_placeholder_member: {
        Args: { _member_id: string };
        Returns: undefined;
      };
      remove_trip_member: {
        Args: { _member_id: string };
        Returns: undefined;
      };
      leave_trip: {
        Args: { _trip_id: string };
        Returns: undefined;
      };
      was_removed_from_trip: {
        Args: { _trip_id: string };
        Returns: boolean;
      };
      is_trip_member: {
        Args: { _trip_id: string };
        Returns: boolean;
      };
      is_trip_open: {
        Args: { _trip_id: string };
        Returns: boolean;
      };
      is_verified_trip_member: {
        Args: { _trip_id: string };
        Returns: boolean;
      };
      is_owner_or_verified_member: {
        Args: { _trip_id: string };
        Returns: boolean;
      };
      get_trip_summary: {
        Args: { _trip_id: string };
        Returns: {
          member_id: string;
          display_name: string;
          paid_cents: number;
          share_cents: number;
        }[];
      };
      claim_shopping_list_item: {
        Args: { _item_id: string };
        Returns: undefined;
      };
      unclaim_shopping_list_item: {
        Args: { _item_id: string };
        Returns: undefined;
      };
      add_expense_and_log_shopping_items: {
        Args: {
          _trip_id: string;
          _amount: number;
          _description: string;
          _date: string | null;
          _item_ids: string[] | null;
        };
        Returns: Database["public"]["Tables"]["expenses"]["Row"];
      };
    };
  };
};
