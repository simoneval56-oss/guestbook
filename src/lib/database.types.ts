export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          subscription_status: string | null;
          plan_type: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          subscription_status?: string | null;
          plan_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          subscription_status?: string | null;
          plan_type?: string | null;
          created_at?: string;
        };
      };
      properties: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          address: string | null;
          main_image_url: string | null;
          short_description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          address?: string | null;
          main_image_url?: string | null;
          short_description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          address?: string | null;
          main_image_url?: string | null;
          short_description?: string | null;
          created_at?: string;
        };
      };
      homebooks: {
        Row: {
          id: string;
          property_id: string;
          title: string;
          layout_type: string;
          public_slug: string;
          public_access_token: string;
          public_access_enabled: boolean;
          is_published: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          title: string;
          layout_type: string;
          public_slug: string;
          public_access_token: string;
          public_access_enabled?: boolean;
          is_published?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          title?: string;
          layout_type?: string;
          public_slug?: string;
          public_access_token?: string;
          public_access_enabled?: boolean;
          is_published?: boolean;
          created_at?: string;
        };
      };
      sections: {
        Row: {
          id: string;
          homebook_id: string;
          title: string;
          order_index: number;
          visible: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          homebook_id: string;
          title: string;
          order_index: number;
          visible?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          homebook_id?: string;
          title?: string;
          order_index?: number;
          visible?: boolean | null;
          created_at?: string;
        };
      };
      subsections: {
        Row: {
          id: string;
          section_id: string;
          content_text: string;
          visible: boolean | null;
          order_index: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          section_id: string;
          content_text: string;
          visible?: boolean | null;
          order_index?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          section_id?: string;
          content_text?: string;
          visible?: boolean | null;
          order_index?: number | null;
          created_at?: string;
        };
      };
      media: {
        Row: {
          id: string;
          section_id: string | null;
          subsection_id: string | null;
          url: string;
          type: string;
          order_index: number | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          section_id?: string | null;
          subsection_id?: string | null;
          url: string;
          type: string;
          order_index?: number | null;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          section_id?: string | null;
          subsection_id?: string | null;
          url?: string;
          type?: string;
          order_index?: number | null;
          description?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
