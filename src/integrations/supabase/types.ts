export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      locations: {
        Row: {
          created_at: string
          id: string
          island: string
          latitude: number | null
          longitude: number | null
          site_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          island: string
          latitude?: number | null
          longitude?: number | null
          site_name: string
        }
        Update: {
          created_at?: string
          id?: string
          island?: string
          latitude?: number | null
          longitude?: number | null
          site_name?: string
        }
        Relationships: []
      }
      manta_image_deletion_log: {
        Row: {
          bucket_id: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          metadata: Json | null
          object_id: string
          reason: string | null
        }
        Insert: {
          bucket_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json | null
          object_id: string
          reason?: string | null
        }
        Update: {
          bucket_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json | null
          object_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      manta_images: {
        Row: {
          id: string
          image_type: string
          image_url: string
          is_primary: boolean | null
          manta_id: string
          sighting_id: string | null
          storage_path: string
          thumbnail_url: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          id?: string
          image_type: string
          image_url: string
          is_primary?: boolean | null
          manta_id: string
          sighting_id?: string | null
          storage_path: string
          thumbnail_url: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          id?: string
          image_type?: string
          image_url?: string
          is_primary?: boolean | null
          manta_id?: string
          sighting_id?: string | null
          storage_path?: string
          thumbnail_url?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manta_images_manta_id_fkey"
            columns: ["manta_id"]
            isOneToOne: false
            referencedRelation: "manta_individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manta_images_sighting_id_fkey"
            columns: ["sighting_id"]
            isOneToOne: false
            referencedRelation: "sightings"
            referencedColumns: ["id"]
          },
        ]
      }
      manta_individuals: {
        Row: {
          age_class: string
          catalog_id: string
          created_at: string
          created_by: string | null
          gender: string
          id: string
          identification_date: string
          name: string
          notes: string | null
          species: string
        }
        Insert: {
          age_class: string
          catalog_id: string
          created_at?: string
          created_by?: string | null
          gender: string
          id?: string
          identification_date: string
          name: string
          notes?: string | null
          species: string
        }
        Update: {
          age_class?: string
          catalog_id?: string
          created_at?: string
          created_by?: string | null
          gender?: string
          id?: string
          identification_date?: string
          name?: string
          notes?: string | null
          species?: string
        }
        Relationships: []
      }
      sightings: {
        Row: {
          behavior: Json | null
          created_at: string
          created_by: string | null
          depth: number | null
          has_injury: boolean | null
          id: string
          injury_notes: string | null
          location_id: string
          manta_id: string
          notes: string | null
          observers: string[] | null
          sighting_date: string
          sighting_time: string | null
          size: number | null
          visibility: number | null
          water_temperature: number | null
        }
        Insert: {
          behavior?: Json | null
          created_at?: string
          created_by?: string | null
          depth?: number | null
          has_injury?: boolean | null
          id?: string
          injury_notes?: string | null
          location_id: string
          manta_id: string
          notes?: string | null
          observers?: string[] | null
          sighting_date: string
          sighting_time?: string | null
          size?: number | null
          visibility?: number | null
          water_temperature?: number | null
        }
        Update: {
          behavior?: Json | null
          created_at?: string
          created_by?: string | null
          depth?: number | null
          has_injury?: boolean | null
          id?: string
          injury_notes?: string | null
          location_id?: string
          manta_id?: string
          notes?: string | null
          observers?: string[] | null
          sighting_date?: string
          sighting_time?: string | null
          size?: number | null
          visibility?: number | null
          water_temperature?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sightings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sightings_manta_id_fkey"
            columns: ["manta_id"]
            isOneToOne: false
            referencedRelation: "manta_individuals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
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
      has_role: {
        Args: {
          user_id: string
          required_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "database_manager" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["database_manager", "user"],
    },
  },
} as const
