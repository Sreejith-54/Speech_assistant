"""
Conversation Storage Service

Handles saving and loading conversation sessions to/from JSON files.
"""

import os
import json
import uuid
import logging
import asyncio  # Import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConversationStorage:
    """
    Service for storing and retrieving conversation sessions.
    """
    
    def __init__(self, storage_dir: str = "conversations"):
        """
        Initialize the conversation storage service.
        
        Args:
            storage_dir: Directory to store conversation files
        """
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)
        logger.info(f"Initialized ConversationStorage with directory: {storage_dir}")

    async def save_session(self, messages: List[Dict],
                           title: Optional[str] = None,
                           session_id: Optional[str] = None,
                           metadata: Optional[Dict[str, Any]] = None) -> str:
        """
        Save a conversation session to a JSON file.
        
        Args:
            messages: List of conversation messages
            title: Optional title for the conversation (auto-generated if None)
            session_id: Optional ID for the session (new UUID if None)
            metadata: Optional metadata to store with the session
            
        Returns:
            str: The session ID
        """
        # Generate ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Generate title if not provided (from first user message or timestamp)
        if not title:
            # Try to find first user message
            for msg in messages:
                if msg.get('role') == 'user' and msg.get('content', '').strip():
                    # Use first ~30 chars of first user message
                    title = msg['content'][:30] + ('...' if len(msg['content']) > 30 else '')
                    break
            
            # Fallback to timestamp if no user messages found
            if not title:
                title = f"Conversation {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        # Prepare session data
        now = datetime.now().isoformat()
        session = {
            "id": session_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "messages": messages,
            "metadata": metadata or {}
        }

        # Define the synchronous file writing part
        def _write_file():
            file_path = os.path.join(self.storage_dir, f"{session_id}.json")
            # Check if file exists to determine if created_at should be preserved
            created_time = now # Default to current time
            if os.path.exists(file_path):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f_read:
                        existing_data = json.load(f_read)
                        created_time = existing_data.get("created_at", now) # Use existing if found
                except Exception as read_err:
                    logger.warning(f"Could not read existing session {session_id} to preserve created_at: {read_err}")
                    pass # Ignore errors reading existing, just use 'now'

            session["created_at"] = created_time # Preserve original creation time or use current if new/error

            # Ensure directory exists (this is quick, maybe okay sync)
            # os.makedirs(os.path.dirname(file_path), exist_ok=True) # Already done in __init__
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(session, f, indent=2, ensure_ascii=False)

        # Run the synchronous file writing in a separate thread
        try:
            await asyncio.to_thread(_write_file) # Now _write_file is defined
            logger.info(f"Saved conversation session (async): {session_id}")
            return session_id
        except Exception as e:
            logger.error(f"Error writing session file {session_id}: {e}")
            raise  # Re-raise the exception to be handled upstream

    async def load_session(self, session_id: str) -> Optional[Dict]:
        """
        Load a conversation session from a JSON file.
        
        Args:
            session_id: ID of the session to load
            
        Returns:
            Optional[Dict]: The session data, or None if not found
        """
        file_path = os.path.join(self.storage_dir, f"{session_id}.json")
        def _read_file():
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None

        try:
            session = await asyncio.to_thread(_read_file)
            if session:
                logger.info(f"Loaded conversation session (async): {session_id}")
                return session
            else:
                logger.warning(f"Session not found (async): {session_id}")
                return None
        except Exception as e:
            logger.error(f"Error loading session {session_id} (async): {e}")
            return None

    async def list_sessions(self) -> List[Dict]:
        """
        List all available conversation sessions.
        
        Returns:
            List[Dict]: List of session metadata
        """
        sessions = []
        def _read_dir_and_files():
            session_list = []
            try:
                filenames = os.listdir(self.storage_dir)
            except Exception as e:
                logger.error(f"Error listing directory {self.storage_dir}: {e}")
                return [] # Return empty list if directory listing fails

            for filename in filenames:
                if filename.endswith('.json'):
                    try:
                        file_path = os.path.join(self.storage_dir, filename)
                        with open(file_path, 'r', encoding='utf-8') as f:
                            session_data = json.load(f)

                        # Include only metadata for listing
                        session_list.append({
                            "id": session_data.get("id"),
                            "title": session_data.get("title"),
                            "created_at": session_data.get("created_at"),
                            "updated_at": session_data.get("updated_at"),
                            "metadata": session_data.get("metadata", {})
                        })
                    except Exception as e:
                        logger.error(f"Error loading session list item from {filename}: {e}")
            return session_list
        try:
            sessions = await asyncio.to_thread(_read_dir_and_files)
            # Sort by most recent first
            sessions.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
            return sessions
        except Exception as e:
            logger.error(f"Error listing sessions (async): {e}")
            return []

    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a conversation session.
        
        Args:
            session_id: ID of the session to delete
            
        Returns:
            bool: True if deleted successfully, False otherwise
        """
        file_path = os.path.join(self.storage_dir, f"{session_id}.json")
        def _remove_file():
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False

        try:
            deleted = await asyncio.to_thread(_remove_file)
            if deleted:
                logger.info(f"Deleted conversation session (async): {session_id}")
                return True
            else:
                logger.warning(f"Session not found for deletion (async): {session_id}")
                return False
        except Exception as e:
            logger.error(f"Error deleting session {session_id} (async): {e}")
            return False
