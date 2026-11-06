
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"created_at": string,"entity": string | null,"entity_id": string | null,"id": number,"metadata": NonNullable<Json>,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"created_at"?: string,"entity"?: string | null,"entity_id"?: string | null,"id"?: never,"metadata"?: NonNullable<Json>,"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"created_at"?: string,"entity"?: string | null,"entity_id"?: string | null,"id"?: never,"metadata"?: NonNullable<Json>,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"authorizations": {
                  Row: {
                    "activated_at": string | null,"contract_id": string,"created_at": string,"end_reason": string | null,"ended_at": string | null,"id": string,"max_amount_cents": number | null,"min_limit_cents": number | null,"provider": Database["public"]['Enums']["provider_kind"],"provider_authorization_id": string | null,"starts_on": string | null,"status": Database["public"]['Enums']["authorization_status"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activated_at"?: string | null,"contract_id": string,"created_at"?: string,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"max_amount_cents"?: number | null,"min_limit_cents"?: number | null,"provider": Database["public"]['Enums']["provider_kind"],"provider_authorization_id"?: string | null,"starts_on"?: string | null,"status"?: Database["public"]['Enums']["authorization_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "activated_at"?: string | null,"contract_id"?: string,"created_at"?: string,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"max_amount_cents"?: number | null,"min_limit_cents"?: number | null,"provider"?: Database["public"]['Enums']["provider_kind"],"provider_authorization_id"?: string | null,"starts_on"?: string | null,"status"?: Database["public"]['Enums']["authorization_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "authorizations_tenant_id_contract_id_fkey"
      columns: ["tenant_id","contract_id"]
isOneToOne: false
      referencedRelation: "contracts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "authorizations_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"charges": {
                  Row: {
                    "amount_cents": number,"authorization_id": string | null,"competence": string,"contract_id": string,"created_at": string,"discount_cents": number,"due_date": string,"id": string,"is_enrollment": boolean,"method": Database["public"]['Enums']["charge_method"],"paid_amount_cents": number | null,"paid_at": string | null,"payment_link": string | null,"pix_payload": string | null,"provider": Database["public"]['Enums']["provider_kind"] | null,"provider_charge_id": string | null,"review_reason": string | null,"reviewed_at": string | null,"status": Database["public"]['Enums']["charge_status"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"authorization_id"?: string | null,"competence": string,"contract_id": string,"created_at"?: string,"discount_cents"?: number,"due_date": string,"id"?: string,"is_enrollment"?: boolean,"method": Database["public"]['Enums']["charge_method"],"paid_amount_cents"?: number | null,"paid_at"?: string | null,"payment_link"?: string | null,"pix_payload"?: string | null,"provider"?: Database["public"]['Enums']["provider_kind"] | null,"provider_charge_id"?: string | null,"review_reason"?: string | null,"reviewed_at"?: string | null,"status"?: Database["public"]['Enums']["charge_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"authorization_id"?: string | null,"competence"?: string,"contract_id"?: string,"created_at"?: string,"discount_cents"?: number,"due_date"?: string,"id"?: string,"is_enrollment"?: boolean,"method"?: Database["public"]['Enums']["charge_method"],"paid_amount_cents"?: number | null,"paid_at"?: string | null,"payment_link"?: string | null,"pix_payload"?: string | null,"provider"?: Database["public"]['Enums']["provider_kind"] | null,"provider_charge_id"?: string | null,"review_reason"?: string | null,"reviewed_at"?: string | null,"status"?: Database["public"]['Enums']["charge_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_tenant_id_authorization_id_fkey"
      columns: ["tenant_id","authorization_id"]
isOneToOne: false
      referencedRelation: "authorizations"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "charges_tenant_id_contract_id_fkey"
      columns: ["tenant_id","contract_id"]
isOneToOne: false
      referencedRelation: "contracts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "charges_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"contract_price_history": {
                  Row: {
                    "changed_by": string | null,"contract_id": string,"created_at": string,"effective_from": string,"id": string,"new_amount_cents": number,"old_amount_cents": number | null,"reason": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_by"?: string | null,"contract_id": string,"created_at"?: string,"effective_from": string,"id"?: string,"new_amount_cents": number,"old_amount_cents"?: number | null,"reason"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "changed_by"?: string | null,"contract_id"?: string,"created_at"?: string,"effective_from"?: string,"id"?: string,"new_amount_cents"?: number,"old_amount_cents"?: number | null,"reason"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_price_history_tenant_id_contract_id_fkey"
      columns: ["tenant_id","contract_id"]
isOneToOne: false
      referencedRelation: "contracts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "contract_price_history_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"contracts": {
                  Row: {
                    "billing_mode": Database["public"]['Enums']["billing_mode"],"created_at": string,"custom_months": (number)[] | null,"discount_type": Database["public"]['Enums']["discount_type"],"discount_value": number,"due_day": number,"end_date": string | null,"ended_at": string | null,"id": string,"monthly_amount_cents": number,"months_policy": Database["public"]['Enums']["months_policy"],"paused_at": string | null,"payer_guardian_id": string,"prorata_first_month": boolean,"start_date": string,"status": Database["public"]['Enums']["contract_status"],"student_id": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_mode"?: Database["public"]['Enums']["billing_mode"],"created_at"?: string,"custom_months"?: (number)[] | null,"discount_type"?: Database["public"]['Enums']["discount_type"],"discount_value"?: number,"due_day": number,"end_date"?: string | null,"ended_at"?: string | null,"id"?: string,"monthly_amount_cents": number,"months_policy"?: Database["public"]['Enums']["months_policy"],"paused_at"?: string | null,"payer_guardian_id": string,"prorata_first_month"?: boolean,"start_date": string,"status"?: Database["public"]['Enums']["contract_status"],"student_id": string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "billing_mode"?: Database["public"]['Enums']["billing_mode"],"created_at"?: string,"custom_months"?: (number)[] | null,"discount_type"?: Database["public"]['Enums']["discount_type"],"discount_value"?: number,"due_day"?: number,"end_date"?: string | null,"ended_at"?: string | null,"id"?: string,"monthly_amount_cents"?: number,"months_policy"?: Database["public"]['Enums']["months_policy"],"paused_at"?: string | null,"payer_guardian_id"?: string,"prorata_first_month"?: boolean,"start_date"?: string,"status"?: Database["public"]['Enums']["contract_status"],"student_id"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contracts_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contracts_tenant_id_payer_guardian_id_fkey"
      columns: ["tenant_id","payer_guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "contracts_tenant_id_student_id_fkey"
      columns: ["tenant_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"enrollment_links": {
                  Row: {
                    "accepted_at": string | null,"accepted_ip_hash": string | null,"authorization_id": string | null,"charge_id": string | null,"consent_text_version": string | null,"contract_id": string,"created_at": string,"expires_at": string,"first_viewed_at": string | null,"id": string,"revoked_at": string | null,"tenant_id": string,"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_ip_hash"?: string | null,"authorization_id"?: string | null,"charge_id"?: string | null,"consent_text_version"?: string | null,"contract_id": string,"created_at"?: string,"expires_at": string,"first_viewed_at"?: string | null,"id"?: string,"revoked_at"?: string | null,"tenant_id"?: string,"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_ip_hash"?: string | null,"authorization_id"?: string | null,"charge_id"?: string | null,"consent_text_version"?: string | null,"contract_id"?: string,"created_at"?: string,"expires_at"?: string,"first_viewed_at"?: string | null,"id"?: string,"revoked_at"?: string | null,"tenant_id"?: string,"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollment_links_tenant_id_authorization_id_fkey"
      columns: ["tenant_id","authorization_id"]
isOneToOne: false
      referencedRelation: "authorizations"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "enrollment_links_tenant_id_charge_id_fkey"
      columns: ["tenant_id","charge_id"]
isOneToOne: false
      referencedRelation: "charges"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "enrollment_links_tenant_id_contract_id_fkey"
      columns: ["tenant_id","contract_id"]
isOneToOne: false
      referencedRelation: "contracts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "enrollment_links_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"guardians": {
                  Row: {
                    "anonymized_at": string | null,"cpf_encrypted": string | null,"cpf_hash": string | null,"cpf_masked": string | null,"created_at": string,"email": string | null,"id": string,"name": string,"notes": string | null,"provider_customer_id": string | null,"tenant_id": string,"updated_at": string,"whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymized_at"?: string | null,"cpf_encrypted"?: string | null,"cpf_hash"?: string | null,"cpf_masked"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"provider_customer_id"?: string | null,"tenant_id"?: string,"updated_at"?: string,"whatsapp"?: string | null
                  }
                  Update: {
                    "anonymized_at"?: string | null,"cpf_encrypted"?: string | null,"cpf_hash"?: string | null,"cpf_masked"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"provider_customer_id"?: string | null,"tenant_id"?: string,"updated_at"?: string,"whatsapp"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardians_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"message_log": {
                  Row: {
                    "body": string,"channel": string,"charge_id": string | null,"created_at": string,"id": string,"opened_at": string | null,"scheduled_for": string,"sent_at": string | null,"status": Database["public"]['Enums']["message_status"],"template_kind": Database["public"]['Enums']["template_kind"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel"?: string,"charge_id"?: string | null,"created_at"?: string,"id"?: string,"opened_at"?: string | null,"scheduled_for": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"template_kind": Database["public"]['Enums']["template_kind"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"channel"?: string,"charge_id"?: string | null,"created_at"?: string,"id"?: string,"opened_at"?: string | null,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"template_kind"?: Database["public"]['Enums']["template_kind"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_log_tenant_id_charge_id_fkey"
      columns: ["tenant_id","charge_id"]
isOneToOne: false
      referencedRelation: "charges"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "message_log_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"message_templates": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"kind": Database["public"]['Enums']["template_kind"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["template_kind"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["template_kind"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_templates_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_connections": {
                  Row: {
                    "api_key_encrypted": string,"api_key_hint": string | null,"created_at": string,"environment": Database["public"]['Enums']["provider_env"],"id": string,"last_error_message": string | null,"provider": Database["public"]['Enums']["provider_kind"],"status": Database["public"]['Enums']["connection_status"],"tenant_id": string,"updated_at": string,"validated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "api_key_encrypted": string,"api_key_hint"?: string | null,"created_at"?: string,"environment"?: Database["public"]['Enums']["provider_env"],"id"?: string,"last_error_message"?: string | null,"provider": Database["public"]['Enums']["provider_kind"],"status"?: Database["public"]['Enums']["connection_status"],"tenant_id": string,"updated_at"?: string,"validated_at"?: string | null
                  }
                  Update: {
                    "api_key_encrypted"?: string,"api_key_hint"?: string | null,"created_at"?: string,"environment"?: Database["public"]['Enums']["provider_env"],"id"?: string,"last_error_message"?: string | null,"provider"?: Database["public"]['Enums']["provider_kind"],"status"?: Database["public"]['Enums']["connection_status"],"tenant_id"?: string,"updated_at"?: string,"validated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_connections_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits": number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"routes": {
                  Row: {
                    "archived_at": string | null,"capacity": number | null,"created_at": string,"id": string,"name": string,"schools": (string)[],"shift": Database["public"]['Enums']["shift"],"tenant_id": string,"updated_at": string,"vehicle": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"capacity"?: number | null,"created_at"?: string,"id"?: string,"name": string,"schools"?: (string)[],"shift": Database["public"]['Enums']["shift"],"tenant_id"?: string,"updated_at"?: string,"vehicle"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"capacity"?: number | null,"created_at"?: string,"id"?: string,"name"?: string,"schools"?: (string)[],"shift"?: Database["public"]['Enums']["shift"],"tenant_id"?: string,"updated_at"?: string,"vehicle"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "routes_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"student_guardians": {
                  Row: {
                    "created_at": string,"guardian_id": string,"id": string,"is_primary_payer": boolean,"relationship": string | null,"student_id": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"guardian_id": string,"id"?: string,"is_primary_payer"?: boolean,"relationship"?: string | null,"student_id": string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"guardian_id"?: string,"id"?: string,"is_primary_payer"?: boolean,"relationship"?: string | null,"student_id"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_guardians_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_guardians_tenant_id_guardian_id_fkey"
      columns: ["tenant_id","guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "student_guardians_tenant_id_student_id_fkey"
      columns: ["tenant_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"students": {
                  Row: {
                    "anonymized_at": string | null,"created_at": string,"grade": string | null,"id": string,"name": string,"route_id": string | null,"school": string | null,"shift": Database["public"]['Enums']["shift"],"status": Database["public"]['Enums']["student_status"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymized_at"?: string | null,"created_at"?: string,"grade"?: string | null,"id"?: string,"name": string,"route_id"?: string | null,"school"?: string | null,"shift": Database["public"]['Enums']["shift"],"status"?: Database["public"]['Enums']["student_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "anonymized_at"?: string | null,"created_at"?: string,"grade"?: string | null,"id"?: string,"name"?: string,"route_id"?: string | null,"school"?: string | null,"shift"?: Database["public"]['Enums']["shift"],"status"?: Database["public"]['Enums']["student_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "students_tenant_id_route_id_fkey"
      columns: ["tenant_id","route_id"]
isOneToOne: false
      referencedRelation: "routes"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "city": string | null,"created_at": string,"document": string | null,"id": string,"is_demo": boolean,"name": string,"onboarding_completed_at": string | null,"phone": string | null,"pix_automatico_eligibility": Database["public"]['Enums']["eligibility"],"plan": Database["public"]['Enums']["saas_plan"],"sibling_discount_type": Database["public"]['Enums']["discount_type"],"sibling_discount_value": number,"subscription_status": Database["public"]['Enums']["subscription_status"],"trial_ends_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"document"?: string | null,"id"?: string,"is_demo"?: boolean,"name": string,"onboarding_completed_at"?: string | null,"phone"?: string | null,"pix_automatico_eligibility"?: Database["public"]['Enums']["eligibility"],"plan"?: Database["public"]['Enums']["saas_plan"],"sibling_discount_type"?: Database["public"]['Enums']["discount_type"],"sibling_discount_value"?: number,"subscription_status"?: Database["public"]['Enums']["subscription_status"],"trial_ends_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"document"?: string | null,"id"?: string,"is_demo"?: boolean,"name"?: string,"onboarding_completed_at"?: string | null,"phone"?: string | null,"pix_automatico_eligibility"?: Database["public"]['Enums']["eligibility"],"plan"?: Database["public"]['Enums']["saas_plan"],"sibling_discount_type"?: Database["public"]['Enums']["discount_type"],"sibling_discount_value"?: number,"subscription_status"?: Database["public"]['Enums']["subscription_status"],"trial_ends_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"name": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"id": string,"name"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"name"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "users_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_endpoints": {
                  Row: {
                    "created_at": string,"id": string,"provider": Database["public"]['Enums']["provider_kind"],"public_id": string,"tenant_id": string,"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"provider": Database["public"]['Enums']["provider_kind"],"public_id": string,"tenant_id": string,"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"provider"?: Database["public"]['Enums']["provider_kind"],"public_id"?: string,"tenant_id"?: string,"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_endpoints_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_events": {
                  Row: {
                    "attempts": number,"created_at": string,"event_id": string,"event_type": string,"id": string,"last_error": string | null,"next_attempt_at": string,"payload": NonNullable<Json>,"processed_at": string | null,"provider": Database["public"]['Enums']["provider_kind"],"status": Database["public"]['Enums']["webhook_status"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"event_id": string,"event_type": string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"payload": NonNullable<Json>,"processed_at"?: string | null,"provider": Database["public"]['Enums']["provider_kind"],"status"?: Database["public"]['Enums']["webhook_status"],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"event_id"?: string,"event_type"?: string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider"?: Database["public"]['Enums']["provider_kind"],"status"?: Database["public"]['Enums']["webhook_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_events_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "current_tenant_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"default_templates":
{ Args: Record<PropertyKey, never>; Returns: {
              "body": string,"kind": Database["public"]['Enums']["template_kind"]
            }[]
                           },
"hit_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"normalize_name":
{ Args: { "p": string }; Returns: string
                           },
"register_students":
{ Args: { "p_rows": Json }; Returns: Json
                           }
          }
          Enums: {
            "authorization_status": "pendente"|"ativa"|"recusada"|"cancelada"|"expirada","billing_mode": "aguardando_adesao"|"pix_automatico"|"pix_comum","charge_method": "pix_automatico"|"pix_comum","charge_status": "agendada"|"enviada"|"paga"|"atrasada"|"cancelada","connection_status": "nao_testada"|"ok"|"erro","contract_status": "ativo"|"pausado"|"encerrado","discount_type": "nenhum"|"valor"|"percentual","eligibility": "desconhecida"|"elegivel"|"nao_elegivel","message_status": "pendente"|"aberto_whatsapp"|"enviado"|"descartado","months_policy": "doze"|"dez"|"personalizada","provider_env": "sandbox"|"producao","provider_kind": "asaas"|"mock","saas_plan": "trial"|"ate_20"|"ate_50"|"ate_100","shift": "manha"|"tarde"|"integral"|"noite","student_status": "ativo"|"pausado"|"encerrado","subscription_status": "trial"|"ativa"|"vencida"|"cancelada","template_kind": "pre_vencimento"|"no_dia"|"atraso_1"|"atraso_3"|"atraso_7"|"boas_vindas"|"confirmacao_pagamento","webhook_status": "pendente"|"processando"|"processado"|"erro"|"ignorado"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "authorization_status": ["pendente", "ativa", "recusada", "cancelada", "expirada"],"billing_mode": ["aguardando_adesao", "pix_automatico", "pix_comum"],"charge_method": ["pix_automatico", "pix_comum"],"charge_status": ["agendada", "enviada", "paga", "atrasada", "cancelada"],"connection_status": ["nao_testada", "ok", "erro"],"contract_status": ["ativo", "pausado", "encerrado"],"discount_type": ["nenhum", "valor", "percentual"],"eligibility": ["desconhecida", "elegivel", "nao_elegivel"],"message_status": ["pendente", "aberto_whatsapp", "enviado", "descartado"],"months_policy": ["doze", "dez", "personalizada"],"provider_env": ["sandbox", "producao"],"provider_kind": ["asaas", "mock"],"saas_plan": ["trial", "ate_20", "ate_50", "ate_100"],"shift": ["manha", "tarde", "integral", "noite"],"student_status": ["ativo", "pausado", "encerrado"],"subscription_status": ["trial", "ativa", "vencida", "cancelada"],"template_kind": ["pre_vencimento", "no_dia", "atraso_1", "atraso_3", "atraso_7", "boas_vindas", "confirmacao_pagamento"],"webhook_status": ["pendente", "processando", "processado", "erro", "ignorado"]
          }
        }
} as const
