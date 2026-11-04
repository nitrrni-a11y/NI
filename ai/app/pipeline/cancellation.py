import threading
from typing import Optional, Set

class BatchCancelledException(Exception):
    """Exception raised when a batch processing run is cancelled by the user."""
    def __init__(self, message: str = "Batch processing was cancelled by user.", run_id: Optional[str] = None):
        super().__init__(message)
        self.run_id = run_id
        self.message = message

class CancellationManager:
    """
    Thread-safe manager to track active and cancelled processing runs in the AI service.
    Allows interrupting batch processing between documents, claims, and narrative stages.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._cancelled_runs: Set[str] = set()
        self._active_runs: Set[str] = set()

    def start_run(self, run_id: Optional[str]):
        if not run_id:
            return
        with self._lock:
            self._active_runs.add(run_id)
            if run_id in self._cancelled_runs:
                print(f"[CancellationManager] Run {run_id} was already marked as cancelled before starting.")
                raise BatchCancelledException(f"Processing run {run_id} was cancelled before starting.", run_id=run_id)
            print(f"[CancellationManager] Run {run_id} started and registered.")

    def cancel_run(self, run_id: Optional[str]) -> bool:
        if not run_id:
            return False
        with self._lock:
            self._cancelled_runs.add(run_id)
            print(f"[CancellationManager] Run {run_id} marked as CANCELLED.")
            return True

    def is_cancelled(self, run_id: Optional[str]) -> bool:
        if not run_id:
            return False
        with self._lock:
            return run_id in self._cancelled_runs

    def check_cancelled(self, run_id: Optional[str]):
        """
        Check if the run has been cancelled. If so, raise BatchCancelledException immediately.
        """
        if self.is_cancelled(run_id):
            print(f"[CancellationManager] Intercepted cancellation for run {run_id}. Halting pipeline.")
            raise BatchCancelledException(f"Processing run {run_id} was cancelled by user.", run_id=run_id)

    def finish_run(self, run_id: Optional[str]):
        if not run_id:
            return
        with self._lock:
            self._active_runs.discard(run_id)
            # Keep in cancelled set briefly if cancelled to avoid late operations, but clean up after
            print(f"[CancellationManager] Run {run_id} finished.")

# Global singleton instance
cancellation_manager = CancellationManager()
