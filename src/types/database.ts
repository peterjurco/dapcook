export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string
          name: string
          invite_token: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_token: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          invite_token?: string
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          household_id: string | null
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          household_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipes: {
        Row: {
          id: string
          household_id: string
          created_by: string
          title: string
          description: string | null
          source_url: string | null
          image_url: string | null
          prep_time_min: number | null
          cook_time_min: number | null
          servings: number | null
          tags: string[]
          ingredients: Json
          steps: Json
          notes: string | null
          is_archived: boolean
          last_used_at: string | null
          title_normalized: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          created_by: string
          title: string
          description?: string | null
          source_url?: string | null
          image_url?: string | null
          prep_time_min?: number | null
          cook_time_min?: number | null
          servings?: number | null
          tags?: string[]
          ingredients?: Json
          steps?: Json
          notes?: string | null
          is_archived?: boolean
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          created_by?: string
          title?: string
          description?: string | null
          source_url?: string | null
          image_url?: string | null
          prep_time_min?: number | null
          cook_time_min?: number | null
          servings?: number | null
          tags?: string[]
          ingredients?: Json
          steps?: Json
          notes?: string | null
          is_archived?: boolean
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      planner_rules: {
        Row: {
          id: string
          household_id: string
          rule_type: string
          label: string | null
          config: Json
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          rule_type: string
          label?: string | null
          config?: Json
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          rule_type?: string
          label?: string | null
          config?: Json
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          household_id: string
          name: string
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          color?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          color?: string | null
          created_at?: string
        }
        Relationships: []
      }
      week_plans: {
        Row: {
          id: string
          household_id: string
          week_start: string
          generated_by: string | null
          ai_reasoning: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          week_start: string
          generated_by?: string | null
          ai_reasoning?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          week_start?: string
          generated_by?: string | null
          ai_reasoning?: string | null
          created_at?: string
        }
        Relationships: []
      }
      meal_slots: {
        Row: {
          id: string
          week_plan_id: string
          day_of_week: number
          meal_type: string
          recipe_id: string | null
          servings_scale: number
          custom_label: string | null
          span_days: number
        }
        Insert: {
          id?: string
          week_plan_id: string
          day_of_week: number
          meal_type?: string
          recipe_id?: string | null
          servings_scale?: number
          custom_label?: string | null
          span_days?: number
        }
        Update: {
          id?: string
          week_plan_id?: string
          day_of_week?: number
          meal_type?: string
          recipe_id?: string | null
          servings_scale?: number
          custom_label?: string | null
          span_days?: number
        }
        Relationships: []
      }
      week_plan_rules: {
        Row: {
          id: string
          week_plan_id: string
          rule_type: string
          label: string | null
          config: Json
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          week_plan_id: string
          rule_type?: string
          label?: string | null
          config?: Json
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          week_plan_id?: string
          rule_type?: string
          label?: string | null
          config?: Json
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      shopping_lists: {
        Row: {
          id: string
          household_id: string
          week_plan_id: string | null
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          week_plan_id?: string | null
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          week_plan_id?: string | null
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          id: string
          shopping_list_id: string
          category: string | null
          name: string
          quantity: number | null
          unit: string | null
          is_checked: boolean
          sort_order: number
          source_recipe_ids: string[]
        }
        Insert: {
          id?: string
          shopping_list_id: string
          category?: string | null
          name: string
          quantity?: number | null
          unit?: string | null
          is_checked?: boolean
          sort_order?: number
          source_recipe_ids?: string[]
        }
        Update: {
          id?: string
          shopping_list_id?: string
          category?: string | null
          name?: string
          quantity?: number | null
          unit?: string | null
          is_checked?: boolean
          sort_order?: number
          source_recipe_ids?: string[]
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          household_id: string
          user_id: string
          role: string
          content: string
          tool_calls: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          user_id: string
          role: string
          content: string
          tool_calls?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          user_id?: string
          role?: string
          content?: string
          tool_calls?: Json | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      user_household_id: {
        Args: Record<string, never>
        Returns: string
      }
      get_household_by_invite_token: {
        Args: { token: string }
        Returns: { id: string; name: string }
      }
      get_household_invite_details: {
        Args: { token: string }
        Returns: { id: string; name: string; members: { display_name: string | null; avatar_url: string | null }[] }[]
      }
      rename_tag: {
        Args: { p_household_id: string; p_old_name: string; p_new_name: string }
        Returns: void
      }
      delete_tag: {
        Args: { p_household_id: string; p_name: string }
        Returns: void
      }
    }
  }
}

// Convenience types
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Household = Tables<'households'>
export type Profile = Tables<'profiles'>
export type Recipe = Tables<'recipes'>
export type PlannerRule = Tables<'planner_rules'>
export type WeekPlan = Tables<'week_plans'>
export type MealSlot = Tables<'meal_slots'>
export type ShoppingList = Tables<'shopping_lists'>
export type ShoppingItem = Tables<'shopping_items'>
export type ChatMessage = Tables<'chat_messages'>
export type WeekPlanRule = Tables<'week_plan_rules'>
