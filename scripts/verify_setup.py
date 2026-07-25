import os
import sys
from dotenv import load_dotenv

# Load env variables
load_dotenv()

def print_status(service_name, success, message):
    if success:
        print(f"[OK] {service_name}: SUCCESS - {message}")
    else:
        print(f"[ERR] {service_name}: FAILED - {message}")

def check_qdrant():
    try:
        from qdrant_client import QdrantClient
        url = os.getenv("QDRANT_URL")
        api_key = os.getenv("QDRANT_API_KEY")
        if not url or not api_key:
            return False, "QDRANT_URL or QDRANT_API_KEY is not defined in .env"
        
        client = QdrantClient(url=url, api_key=api_key)
        # Try getting collections to test connection
        collections = client.get_collections()
        return True, f"Connected. Collections count: {len(collections.collections)}"
    except Exception as e:
        return False, str(e)

def check_groq():
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return False, "GROQ_API_KEY is not defined in .env"
        
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": "Ping"}],
            max_tokens=5
        )
        response_text = completion.choices[0].message.content.strip()
        return True, f"Connected. LLM Response: '{response_text}'"
    except Exception as e:
        return False, str(e)

def check_supabase():
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            return False, "SUPABASE_URL or SUPABASE_KEY is not defined in .env"
        
        supabase = create_client(url, key)
        
        # Test writing a row to 'runs'
        test_run_id = "test-verify-connection"
        data, count = supabase.table("runs").insert({"run_id": test_run_id, "status": "test"}).execute()
        
        # Test reading the row back
        data, count = supabase.table("runs").select("*").eq("run_id", test_run_id).execute()
        if not data[1] if hasattr(data, '__len__') and len(data) > 1 else data:
            # Let's check both possibilities (newer vs older supabase-py versions return formats)
            # Typically supabase-py returns APIResponse object where data is in .data
            res_data = getattr(data, "data", data)
            if not res_data or len(res_data) == 0:
                return False, "Inserted row but could not read it back."
        
        # Test deleting the row
        supabase.table("runs").delete().eq("run_id", test_run_id).execute()
        
        return True, "Write, Read, and Delete verified on 'runs' table."
    except Exception as e:
        return False, f"Supabase error (Ensure you ran scripts/schema.sql in Supabase): {str(e)}"

def main():
    print("GenomeRAG Setup Verification")
    print("============================")
    
    q_ok, q_msg = check_qdrant()
    print_status("Qdrant Cloud", q_ok, q_msg)
    
    g_ok, g_msg = check_groq()
    print_status("Groq LLM", g_ok, g_msg)
    
    s_ok, s_msg = check_supabase()
    print_status("Supabase DB", s_ok, s_msg)
    
    if q_ok and g_ok and s_ok:
        print("\nAll systems operational! [OK][OK][OK]")
        sys.exit(0)
    else:
        print("\nOne or more services failed verification.")
        sys.exit(1)

if __name__ == "__main__":
    main()
