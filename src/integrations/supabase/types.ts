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
      attachments: {
        Row: {
          comment_id: string | null
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          is_internal: boolean
          mime_type: string | null
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          is_internal?: boolean
          mime_type?: string | null
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          is_internal?: boolean
          mime_type?: string | null
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_client_admin: boolean
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_client_admin?: boolean
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_client_admin?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contrato_fim: string | null
          contrato_inicio: string | null
          created_at: string
          dias_fecho_automatico: number | null
          horas_pacote: number | null
          horas_pacote_anual: number | null
          id: string
          nif: string | null
          nome: string
          tarifa_hora: number
          tipo_contrato: Database["public"]["Enums"]["contract_type"]
          updated_at: string
        }
        Insert: {
          contrato_fim?: string | null
          contrato_inicio?: string | null
          created_at?: string
          dias_fecho_automatico?: number | null
          horas_pacote?: number | null
          horas_pacote_anual?: number | null
          id?: string
          nif?: string | null
          nome: string
          tarifa_hora?: number
          tipo_contrato?: Database["public"]["Enums"]["contract_type"]
          updated_at?: string
        }
        Update: {
          contrato_fim?: string | null
          contrato_inicio?: string | null
          created_at?: string
          dias_fecho_automatico?: number | null
          horas_pacote?: number | null
          horas_pacote_anual?: number | null
          id?: string
          nif?: string | null
          nome?: string
          tarifa_hora?: number
          tipo_contrato?: Database["public"]["Enums"]["contract_type"]
          updated_at?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          created_at: string
          id: string
          is_internal: boolean
          mensagem: string
          ticket_id: string
          user_id: string
          visto_em: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal?: boolean
          mensagem: string
          ticket_id: string
          user_id: string
          visto_em?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_internal?: boolean
          mensagem?: string
          ticket_id?: string
          user_id?: string
          visto_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
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
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          nome?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      response_templates: {
        Row: {
          created_at: string
          id: string
          mensagem: string
          ordem: number
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mensagem: string
          ordem?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mensagem?: string
          ordem?: number
          titulo?: string
          updated_at?: string
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
      ticket_escalations: {
        Row: {
          created_at: string
          id: string
          motivo: string
          ticket_id: string
          tipo_anterior: Database["public"]["Enums"]["intervention_type"]
          tipo_novo: Database["public"]["Enums"]["intervention_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          motivo: string
          ticket_id: string
          tipo_anterior: Database["public"]["Enums"]["intervention_type"]
          tipo_novo: Database["public"]["Enums"]["intervention_type"]
        }
        Update: {
          created_at?: string
          id?: string
          motivo?: string
          ticket_id?: string
          tipo_anterior?: Database["public"]["Enums"]["intervention_type"]
          tipo_novo?: Database["public"]["Enums"]["intervention_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ticket_escalations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_satisfaction: {
        Row: {
          comentario: string | null
          created_at: string
          id: string
          rating: number | null
          submitted_at: string | null
          ticket_id: string
          token: string
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          submitted_at?: string | null
          ticket_id: string
          token: string
        }
        Update: {
          comentario?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          submitted_at?: string | null
          ticket_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_satisfaction_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tag_assignments: {
        Row: {
          created_at: string
          tag_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "ticket_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tag_assignments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tags: {
        Row: {
          cor: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          descricao: string
          estado: Database["public"]["Enums"]["ticket_status"]
          fechado_em: string | null
          id: string
          motivo_fecho: Database["public"]["Enums"]["close_reason"] | null
          numero: number
          prioridade: Database["public"]["Enums"]["ticket_priority"]
          solucao_aplicada: string | null
          tecnico_responsavel: string | null
          tecnico_responsavel_id: string | null
          tempo_gasto_minutos: number
          tipo_intervencao: Database["public"]["Enums"]["intervention_type"]
          titulo: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          descricao: string
          estado?: Database["public"]["Enums"]["ticket_status"]
          fechado_em?: string | null
          id?: string
          motivo_fecho?: Database["public"]["Enums"]["close_reason"] | null
          numero?: number
          prioridade?: Database["public"]["Enums"]["ticket_priority"]
          solucao_aplicada?: string | null
          tecnico_responsavel?: string | null
          tecnico_responsavel_id?: string | null
          tempo_gasto_minutos?: number
          tipo_intervencao?: Database["public"]["Enums"]["intervention_type"]
          titulo: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string
          estado?: Database["public"]["Enums"]["ticket_status"]
          fechado_em?: string | null
          id?: string
          motivo_fecho?: Database["public"]["Enums"]["close_reason"] | null
          numero?: number
          prioridade?: Database["public"]["Enums"]["ticket_priority"]
          solucao_aplicada?: string | null
          tecnico_responsavel?: string | null
          tecnico_responsavel_id?: string | null
          tempo_gasto_minutos?: number
          tipo_intervencao?: Database["public"]["Enums"]["intervention_type"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          data_trabalho: string
          descricao: string | null
          estado_faturacao: string
          id: string
          minutos: number
          nao_contabilizar: boolean
          ticket_id: string
          tipo_intervencao: Database["public"]["Enums"]["intervention_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_trabalho?: string
          descricao?: string | null
          estado_faturacao?: string
          id?: string
          minutos: number
          nao_contabilizar?: boolean
          ticket_id: string
          tipo_intervencao?: Database["public"]["Enums"]["intervention_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_trabalho?: string
          descricao?: string | null
          estado_faturacao?: string
          id?: string
          minutos?: number
          nao_contabilizar?: boolean
          ticket_id?: string
          tipo_intervencao?: Database["public"]["Enums"]["intervention_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
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
      calcular_estado_faturacao: {
        Args: {
          _client_id: string
          _minutos: number
          _nao_contabilizar: boolean
        }
        Returns: string
      }
      client_horas_consumidas_anual: {
        Args: { _client_id: string }
        Returns: number
      }
      client_horas_consumidas_mes: {
        Args: { _ano: number; _client_id: string; _mes: number }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
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
      is_client_admin: {
        Args: { _client_id: string; _user_id: string }
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
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      user_client_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "client"
      close_reason:
        | "resolvido"
        | "nao_reproduzivel"
        | "duplicado"
        | "fechado_pelo_cliente"
        | "inatividade"
      contract_type: "avenca" | "pontual"
      intervention_type: "remota" | "presencial" | "critica" | "preventiva"
      ticket_priority: "baixa" | "media" | "alta"
      ticket_status: "aberto" | "em_progresso" | "aguarda_cliente" | "fechado"
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
      app_role: ["admin", "client"],
      close_reason: [
        "resolvido",
        "nao_reproduzivel",
        "duplicado",
        "fechado_pelo_cliente",
        "inatividade",
      ],
      contract_type: ["avenca", "pontual"],
      intervention_type: ["remota", "presencial", "critica", "preventiva"],
      ticket_priority: ["baixa", "media", "alta"],
      ticket_status: ["aberto", "em_progresso", "aguarda_cliente", "fechado"],
    },
  },
} as const
