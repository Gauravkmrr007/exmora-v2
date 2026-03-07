from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import Optional, List
import os
import fitz
import httpx
import jwt
from jwt.exceptions import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import boto3
from botocore.exceptions import ClientError
from datetime import datetime
import json
import gc
import time
import tempfile
import shutil

# ---------------------------------------------------------
# setup things
# loading env vars for api security
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
MONGO_URI = os.getenv("MONGO_URI")

# AWS Config
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_BUCKET = os.getenv("AWS_BUCKET_NAME")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# check if api key is there or bail out
if not OPENROUTER_API_KEY:
    raise RuntimeError("OPENROUTER_API_KEY not found in .env file.")

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET not found in .env file.")

# fast api init
app = FastAPI()

# cors setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Setup
client = AsyncIOMotorClient(MONGO_URI)
db = client.get_database()
sessions_col = db.sessions

# S3 Setup
s3_client = None
if AWS_ACCESS_KEY and AWS_SECRET_KEY and AWS_BUCKET:
    try:
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY,
            aws_secret_access_key=AWS_SECRET_KEY,
            region_name=AWS_REGION
        )
        print("DEBUG: AWS S3 client initialized.")
    except Exception as e:
        print(f"DEBUG: Failed to init S3 client: {e}")

# ---------------------------------------------------------
# JWT Authentication Dependency
# ---------------------------------------------------------
async def verify_token(authorization: Optional[str] = Header(None)) -> str:
    if not authorization:
        print("AUTH FAILURE: No authorization header")
        raise HTTPException(status_code=401, detail="No authorization header provided")
    
    try:
        parts = authorization.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            print(f"AUTH FAILURE: Invalid format. Header parts: {len(parts)}")
            raise HTTPException(status_code=401, detail="Invalid authorization header format")
        
        token = parts[1]
        # Debug: check secret length (don't log the secret itself)
        # print(f"DEBUG: Using JWT_SECRET of length {len(JWT_SECRET)}")
        
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("userId")
        
        if not user_id:
            print("AUTH FAILURE: Decoded payload missing userId")
            raise HTTPException(status_code=401, detail="Invalid token payload: missing userId")
        
        return user_id
    except InvalidTokenError as e:
        print(f"AUTH FAILURE: Invalid/Expired token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")
    except Exception as e:
        print(f"AUTH FAILURE: General error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Authentication error: {str(e)}")

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extracts text from PDF file path using PyMuPDF (fitz).
    Opens from disk to save RAM, uses list-join for speed.
    """
    try:
        doc = fitz.open(file_path)
        text_parts = []
        for page in doc:
            try:
                page_text = page.get_text("text")
                if page_text:
                    text_parts.append(page_text)
            except Exception as page_err:
                print(f"DEBUG: Skipping page due to error: {page_err}")
                continue
        
        full_text = "\n".join(text_parts)
        doc.close()
        return full_text
    except Exception as e:
        print(f"ERROR: General PDF extraction failure: {e}")
        return ""
    finally:
        gc.collect()

# ---------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------

@app.get("/")
def root():
    return {"status": "API is running"}

@app.get("/sessions")
async def get_sessions(user_id: str = Depends(verify_token)):
    """List all chat sessions for the user"""
    cursor = sessions_col.find({"userId": user_id}).sort("updated_at", -1)
    sessions = await cursor.to_list(length=100)
    # Convert ObjectId to string
    for s in sessions:
        s["_id"] = str(s["_id"])
    return sessions

@app.get("/sessions/{session_id}")
async def get_session(session_id: str, user_id: str = Depends(verify_token)):
    """Get full details of a specific session"""
    session = await sessions_col.find_one({"_id": ObjectId(session_id), "userId": user_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session["_id"] = str(session["_id"])
    return session

@app.post("/upload")
async def upload_pdf(files: List[UploadFile] = File(...), user_id: str = Depends(verify_token)):
    if len(files) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 PDF files allowed.")

    documents = []
    total_text_length = 0

    start_time = time.time()
    for file in files:
        file_start = time.time()
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"File {file.filename} is not a PDF.")
        
        # 1. Save to temporary file instead of reading all into RAM
        # This is key for Render's 512MB limit
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                shutil.copyfileobj(file.file, tmp)
                tmp_path = tmp.name
            print(f"DEBUG: Saved {file.filename} to temp file in {time.time() - file_start:.4f}s")
            
            # 2. Extract text from the file path
            ext_start = time.time()
            text = extract_text_from_pdf(tmp_path)
            print(f"DEBUG: Text extraction for {file.filename} took {time.time() - ext_start:.4f}s")

            total_text_length += len(text)
            
            # 3. Upload to S3 if configured
            pdf_url = None
            if s3_client and AWS_BUCKET:
                s3_start = time.time()
                try:
                    file_key = f"uploads/{user_id}/{int(datetime.now().timestamp())}_{file.filename}"
                    # Upload directly from file path
                    s3_client.upload_file(tmp_path, AWS_BUCKET, file_key)
                    pdf_url = f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{file_key}"
                    print(f"DEBUG: S3 Upload for {file.filename} took {time.time() - s3_start:.4f}s")
                except Exception as e:
                    print(f"DEBUG: S3 Upload Error: {e}")
            
            documents.append({
                "filename": file.filename,
                "text": text,
                "pdf_url": pdf_url
            })
        finally:
            # Clean up temp file immediately
            if 'tmp_path' in locals() and os.path.exists(tmp_path):
                os.remove(tmp_path)
                
    print(f"DEBUG: Total upload processing took {time.time() - start_time:.4f}s")

    # Create new session in MongoDB
    # If multiple files, title can be "Doc1, Doc2..." or just first doc name + others
    session_title = files[0].filename
    if len(files) > 1:
        session_title += f" + {len(files)-1} others"

    new_session = {
        "userId": user_id,
        "title": session_title,
        "documents": documents, # New structure
        "messages": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    result = await sessions_col.insert_one(new_session)
    
    return {
        "message": f"{len(files)} PDFs uploaded and session created",
        "session_id": str(result.inserted_id),
        "text_length": total_text_length,
        "documents": [{"filename": d["filename"]} for d in documents]
    }

@app.post("/ask")
async def ask_question(
    request: Request, 
    question: str = Form(...), 
    session_id: Optional[str] = Form(None),
    user_id: str = Depends(verify_token)
):
    # Find active session
    if not session_id:
        # Fallback to last updated session if none provided
        session = await sessions_col.find_one({"userId": user_id}, sort=[("updated_at", -1)])
    else:
        session = await sessions_col.find_one({"_id": ObjectId(session_id), "userId": user_id})

    if not session:
        return {"error": "No active session found. Please upload a PDF first."}

    doc_context = ""
    
    # Handle both old format (single text) and new format (list of documents)
    if "documents" in session and isinstance(session["documents"], list):
        for idx, doc in enumerate(session["documents"]):
            doc_content = doc.get("text", "")[:15000] # Limit per doc
            doc_context += f"\n\n--- DOCUMENT {idx+1}: {doc.get('filename', 'Unknown')} ---\n{doc_content}"
    else:
        # Fallback for old sessions
        doc_context = session.get("text", "")[:5000]

    history = session.get("messages", [])[-5:] # Get last 5 messages for context
    
    # Construct AI Prompts
    system_prompt = f"""
You are an expert academic assistant at Exmora.
You have access to the following documents. Answer questions based on them.
If comparing, explicitly reference the documents by name.
If the answer isn't in the documents, say so.

### DOCUMENTS CONTENT:
{doc_context}

### RECENT CONTEXT:
{json.dumps(history)}
"""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Exmora"
    }

    payload = {
        "model": "openai/gpt-3.5-turbo", 
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question}
        ],
        "temperature": 0.3
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=httpx.Timeout(90.0, connect=10.0)
            )
            
        if response.status_code != 200:
            print(f"AI ERROR: {response.status_code} - {response.text}")
            raise HTTPException(status_code=502, detail=f"AI provider error: {response.text}")

        data = response.json()
        if "choices" not in data or not data["choices"]:
            print(f"AI EMPTY RESPONSE: {data}")
            raise HTTPException(status_code=502, detail="AI provider returned an empty response")
            
        answer = data["choices"][0]["message"]["content"]
    except HTTPException:
        raise
    except Exception as e:
        print(f"AI FETCH EXCEPTION: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect to AI provider")

    # Save to history
    await sessions_col.update_one(
        {"_id": ObjectId(session.get("_id"))},
        {
            "$push": {"messages": {"q": question, "a": answer, "t": datetime.utcnow().isoformat()}},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    # OPTIMIZATION: Clear memory after processing
    del doc_context
    gc.collect()

    return {
        "question": question,
        "answer": answer,
        "session_id": str(session["_id"])
    }

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = Depends(verify_token)):
    result = await sessions_col.delete_one({"_id": ObjectId(session_id), "userId": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}
