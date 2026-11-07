export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blog_posts: {
        Row: {
          ai_reason: string | null
          ai_recommend: boolean | null
          approved_at: string | null
          body_md: string
          category: string
          created_at: string
          description: string
          id: string
          my_note: string | null
          published_at: string | null
          slug: string
          source_channel: string | null
          source_title: string | null
          source_url: string | null
          source_video_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_reason?: string | null
          ai_recommend?: boolean | null
          approved_at?: string | null
          body_md?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          my_note?: string | null
          published_at?: string | null
          slug: string
          source_channel?: string | null
          source_title?: string | null
          source_url?: string | null
          source_video_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_reason?: string | null
          ai_recommend?: boolean | null
          approved_at?: string | null
          body_md?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          my_note?: string | null
          published_at?: string | null
          slug?: string
          source_channel?: string | null
          source_title?: string | null
          source_url?: string | null
          source_video_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      blog_sources: {
        Row: {
          attempts: number
          created_at: string
          last_error: string | null
          processed_at: string | null
          status: string
          title: string | null
          video_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
          title?: string | null
          video_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
          title?: string | null
          video_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          access_token: string
          customer_email: string | null
          granted_at: string
          id: string
          payment_id: string
          product_id: string | null
          provider: string
          seller_id: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string
          customer_email?: string | null
          granted_at?: string
          id?: string
          payment_id: string
          product_id?: string | null
          provider?: string
          seller_id?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          customer_email?: string | null
          granted_at?: string
          id?: string
          payment_id?: string
          product_id?: string | null
          provider?: string
          seller_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          consent: boolean
          contact: string
          created_at: string
          file_name: string | null
          file_storage_path: string | null
          id: string
          kakao_notify_status: string | null
          name: string
          notes: string
          notified_at: string | null
          ref_code: string | null
          reference_links: string
          services: string[]
          sheet_notify_status: string | null
          source: string
        }
        Insert: {
          consent?: boolean
          contact: string
          created_at?: string
          file_name?: string | null
          file_storage_path?: string | null
          id?: string
          kakao_notify_status?: string | null
          name: string
          notes?: string
          notified_at?: string | null
          ref_code?: string | null
          reference_links?: string
          services?: string[]
          sheet_notify_status?: string | null
          source?: string
        }
        Update: {
          consent?: boolean
          contact?: string
          created_at?: string
          file_name?: string | null
          file_storage_path?: string | null
          id?: string
          kakao_notify_status?: string | null
          name?: string
          notes?: string
          notified_at?: string | null
          ref_code?: string | null
          reference_links?: string
          services?: string[]
          sheet_notify_status?: string | null
          source?: string
        }
        Relationships: []
      }
      kakao_chat_sessions: {
        Row: {
          data: Json
          menu: string | null
          photos: string[]
          question_alert_at: string | null
          step: string
          updated_at: string
          user_key: string
        }
        Insert: {
          data?: Json
          menu?: string | null
          photos?: string[]
          question_alert_at?: string | null
          step?: string
          updated_at?: string
          user_key: string
        }
        Update: {
          data?: Json
          menu?: string | null
          photos?: string[]
          question_alert_at?: string | null
          step?: string
          updated_at?: string
          user_key?: string
        }
        Relationships: []
      }
      kakao_faq_extra: {
        Row: {
          active: boolean
          answer: string
          created_at: string
          id: string
          keywords: string[]
          menu: string | null
        }
        Insert: {
          active?: boolean
          answer: string
          created_at?: string
          id?: string
          keywords: string[]
          menu?: string | null
        }
        Update: {
          active?: boolean
          answer?: string
          created_at?: string
          id?: string
          keywords?: string[]
          menu?: string | null
        }
        Relationships: []
      }
      kakao_questions: {
        Row: {
          added_to_faq: boolean
          admin_answer: string | null
          answered_by_ai: boolean
          bot_answer: string
          contact: string | null
          created_at: string
          id: string
          menu: string | null
          question: string
          status: string
          user_key: string
        }
        Insert: {
          added_to_faq?: boolean
          admin_answer?: string | null
          answered_by_ai?: boolean
          bot_answer?: string
          contact?: string | null
          created_at?: string
          id?: string
          menu?: string | null
          question: string
          status?: string
          user_key: string
        }
        Update: {
          added_to_faq?: boolean
          admin_answer?: string | null
          answered_by_ai?: boolean
          bot_answer?: string
          contact?: string | null
          created_at?: string
          id?: string
          menu?: string | null
          question?: string
          status?: string
          user_key?: string
        }
        Relationships: []
      }
      kakao_oauth_tokens: {
        Row: {
          connected_at: string | null
          id: string
          pending_state: string | null
          pending_state_expires_at: string | null
          refresh_token: string | null
          refresh_token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          id?: string
          pending_state?: string | null
          pending_state_expires_at?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          id?: string
          pending_state?: string | null
          pending_state_expires_at?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outreach_candidates: {
        Row: {
          business_score: number
          channel_id: string
          channel_name: string
          channel_url: string
          checked_at: string | null
          country: string | null
          created_at: string
          description_summary: string | null
          email: string | null
          niche: string | null
          reject_reason: string | null
          status: string
          subscribers: number | null
          top_title: string | null
          top_url: string | null
        }
        Insert: {
          business_score?: number
          channel_id: string
          channel_name: string
          channel_url: string
          checked_at?: string | null
          country?: string | null
          created_at?: string
          description_summary?: string | null
          email?: string | null
          niche?: string | null
          reject_reason?: string | null
          status?: string
          subscribers?: number | null
          top_title?: string | null
          top_url?: string | null
        }
        Update: {
          business_score?: number
          channel_id?: string
          channel_name?: string
          channel_url?: string
          checked_at?: string | null
          country?: string | null
          created_at?: string
          description_summary?: string | null
          email?: string | null
          niche?: string | null
          reject_reason?: string | null
          status?: string
          subscribers?: number | null
          top_title?: string | null
          top_url?: string | null
        }
        Relationships: []
      }
      outreach_drafts: {
        Row: {
          approved_at: string | null
          batch_date: string
          channel_id: string
          channel_name: string
          channel_url: string
          created_at: string
          email: string
          error: string | null
          gmail_message_id: string | null
          id: string
          niche: string | null
          sent_at: string | null
          status: string
          subscribers: number | null
          top_title: string | null
          top_url: string | null
        }
        Insert: {
          approved_at?: string | null
          batch_date: string
          channel_id: string
          channel_name: string
          channel_url: string
          created_at?: string
          email: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          niche?: string | null
          sent_at?: string | null
          status?: string
          subscribers?: number | null
          top_title?: string | null
          top_url?: string | null
        }
        Update: {
          approved_at?: string | null
          batch_date?: string
          channel_id?: string
          channel_name?: string
          channel_url?: string
          created_at?: string
          email?: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          niche?: string | null
          sent_at?: string | null
          status?: string
          subscribers?: number | null
          top_title?: string | null
          top_url?: string | null
        }
        Relationships: []
      }
      outreach_suppression: {
        Row: {
          created_at: string
          email: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          email: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string | null
        }
        Relationships: []
      }
      outreach_quota: {
        Row: {
          day: string
          units: number
          updated_at: string | null
        }
        Insert: {
          day: string
          units?: number
          updated_at?: string | null
        }
        Update: {
          day?: string
          units?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      outreach_settings: {
        Row: {
          auto_pick: boolean
          auto_send: boolean
          id: number
          pick_cursor: number
          updated_at: string | null
        }
        Insert: {
          auto_pick?: boolean
          auto_send?: boolean
          id?: number
          pick_cursor?: number
          updated_at?: string | null
        }
        Update: {
          auto_pick?: boolean
          auto_send?: boolean
          id?: number
          pick_cursor?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_email: string | null
          id: string
          payment_id: string
          product_id: string | null
          product_title: string
          provider: string
          raw: Json | null
          seller_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          id?: string
          payment_id: string
          product_id?: string | null
          product_title: string
          provider?: string
          raw?: Json | null
          seller_id?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          id?: string
          payment_id?: string
          product_id?: string | null
          product_title?: string
          provider?: string
          raw?: Json | null
          seller_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          accent: string
          active: boolean
          amount: number
          category: string | null
          created_at: string
          currency: string
          delivery_file_path: string | null
          delivery_url: string | null
          description: string
          id: string
          ls_store_slug: string | null
          ls_variant_id: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          seller_id: string | null
          slug: string | null
          sort_order: number
          span: string
          status: Database["public"]["Enums"]["product_status"]
          tag: string
          tags: string[]
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accent?: string
          active?: boolean
          amount: number
          category?: string | null
          created_at?: string
          currency?: string
          delivery_file_path?: string | null
          delivery_url?: string | null
          description: string
          id?: string
          ls_store_slug?: string | null
          ls_variant_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          seller_id?: string | null
          slug?: string | null
          sort_order?: number
          span?: string
          status?: Database["public"]["Enums"]["product_status"]
          tag: string
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accent?: string
          active?: boolean
          amount?: number
          category?: string | null
          created_at?: string
          currency?: string
          delivery_file_path?: string | null
          delivery_url?: string | null
          description?: string
          id?: string
          ls_store_slug?: string | null
          ls_variant_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          seller_id?: string | null
          slug?: string | null
          sort_order?: number
          span?: string
          status?: Database["public"]["Enums"]["product_status"]
          tag?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      seller_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          business_name: string
          created_at: string
          payout_account: string | null
          payout_bank: string | null
          payout_holder: string | null
          slug: string
          updated_at: string
          user_id: string
          verified: boolean
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          business_name: string
          created_at?: string
          payout_account?: string | null
          payout_bank?: string | null
          payout_holder?: string | null
          slug: string
          updated_at?: string
          user_id: string
          verified?: boolean
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          business_name?: string
          created_at?: string
          payout_account?: string | null
          payout_bank?: string | null
          payout_holder?: string | null
          slug?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
          website_url?: string | null
        }
        Relationships: []
      }
      site_visits: {
        Row: {
          created_at: string
          device: string
          id: number
          path: string
          ref_code: string | null
          referrer_host: string | null
          session_id: string
          source: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          device?: string
          id?: number
          path: string
          ref_code?: string | null
          referrer_host?: string | null
          session_id: string
          source?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          device?: string
          id?: number
          path?: string
          ref_code?: string | null
          referrer_host?: string | null
          session_id?: string
          source?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      outreach_add_drafts: {
        Args: { p_rows: Json }
        Returns: {
          channel_id: string
        }[]
      }
      kakao_chat_add_photos: {
        Args: { _max?: number; _urls: string[]; _user_key: string }
        Returns: number
      }
      kakao_question_alert_due: {
        Args: { _now?: string; _user_key: string }
        Returns: boolean
      }
      outreach_quota_add: {
        Args: { p_day: string; p_units: number }
        Returns: number
      }
      partner_account_mail_result: {
        Args: { _id: string; _error?: string; _now?: string }
        Returns: Json
      }
      partner_account_mail_target: { Args: { _id: string }; Returns: Json }
      partner_account_target: { Args: { _view_key: string }; Returns: Json }
      partner_admin_overview: { Args: { _now?: string }; Returns: Json }
      partner_apply: { Args: { _p: Json }; Returns: Json }
      partner_approval_mail_result: {
        Args: { _id: string; _error?: string; _now?: string }
        Returns: Json
      }
      partner_approval_mail_target: { Args: { _id: string }; Returns: Json }
      partner_attach_reels: {
        Args: { _order_no: string; _payurl: string; _phone: string; _ref: string; _now?: string }
        Returns: Json
      }
      partner_auto_payouts: { Args: { _now?: string }; Returns: Json }
      partner_auto_payouts_notified: {
        Args: { _run_month: string; _status: string; _now?: string }
        Returns: Json
      }
      partner_change_account: {
        Args: {
          _user_id: string
          _bank_name: string
          _bank_account: string
          _bank_holder: string
          _user_agent?: string
          _now?: string
        }
        Returns: Json
      }
      partner_cleanup_unapproved: { Args: { _now?: string }; Returns: number }
      partner_commission_cancel: {
        Args: { _id: string; _note?: string; _now?: string }
        Returns: Json
      }
      partner_dashboard: {
        Args: { _user_id: string; _period?: string; _now?: string }
        Returns: Json
      }
      partner_inquiry_paid: {
        Args: { _inquiry_id: string; _amount: number; _now?: string }
        Returns: Json
      }
      partner_link_user: {
        Args: { _view_key: string; _user_id: string; _email: string }
        Returns: Json
      }
      partner_make_payouts: { Args: { _month: string; _now?: string }; Returns: Json }
      partner_me: { Args: { _view_key: string; _now?: string }; Returns: Json }
      partner_paid_list: { Args: { _from: string; _to: string }; Returns: Json }
      partner_payout_mark_paid: { Args: { _id: string; _now?: string }; Returns: Json }
      partner_refresh_payable: { Args: { _now?: string }; Returns: number }
      partner_session: { Args: { _user_id: string }; Returns: Json }
      partner_set_status: {
        Args: { _id: string; _status: string; _now?: string }
        Returns: Json
      }
      partner_transfer_list: { Args: { _month: string }; Returns: Json }
      partner_update_profile: {
        Args: { _user_id: string; _phone: string; _channels: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      site_visit_stats: {
        Args: { _days?: number; _now?: string }
        Returns: Json
      }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slugify: { Args: { input: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
      product_status: "draft" | "review" | "live" | "rejected"
      product_type: "web" | "app" | "file" | "license"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      product_status: ["draft", "review", "live", "rejected"],
      product_type: ["web", "app", "file", "license"],
    },
  },
} as const
