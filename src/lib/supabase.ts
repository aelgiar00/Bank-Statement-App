import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
auth: {
    // السطر ده هو السر: بيخلي الدخول مؤقت ولما تقفل البرنامج بيطير
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined
}
})