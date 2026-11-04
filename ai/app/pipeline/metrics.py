import time
from typing import Dict, Any, List, Optional
from threading import Lock

class PipelineMetrics:
    """
    Thread-safe metrics collector for recording LLM and AI pipeline stage performance,
    tokens, rate limit waits, retries, and API call efficiency.
    """
    def __init__(self):
        self._lock = Lock()
        self._runs: Dict[str, Dict[str, Any]] = {}

    def start_run(self, run_id: Optional[str] = None) -> str:
        r_id = run_id or f"run_{int(time.time()*1000)}"
        with self._lock:
            self._runs[r_id] = {
                "run_id": r_id,
                "start_time": time.time(),
                "end_time": None,
                "stages": {}
            }
        return r_id

    def record_stage_call(
        self,
        stage_name: str,
        provider: str,
        model: str,
        items_count: int,
        requests_count: int,
        duration: float,
        rate_limit_wait: float = 0.0,
        retries: int = 0,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        successful_items: int = 0,
        failed_items: int = 0,
        run_id: Optional[str] = None
    ):
        with self._lock:
            r_id = run_id or "global"
            if r_id not in self._runs:
                self._runs[r_id] = {
                    "run_id": r_id,
                    "start_time": time.time(),
                    "end_time": None,
                    "stages": {}
                }
            stages = self._runs[r_id]["stages"]
            key = f"{stage_name}|{provider}|{model}"
            if key not in stages:
                stages[key] = {
                    "stage": stage_name,
                    "provider": provider,
                    "model": model,
                    "items_count": 0,
                    "requests_count": 0,
                    "duration": 0.0,
                    "rate_limit_wait": 0.0,
                    "retries": 0,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "successful_items": 0,
                    "failed_items": 0
                }
            s = stages[key]
            s["items_count"] += items_count
            s["requests_count"] += requests_count
            s["duration"] += duration
            s["rate_limit_wait"] += rate_limit_wait
            s["retries"] += retries
            s["prompt_tokens"] += prompt_tokens
            s["completion_tokens"] += completion_tokens
            s["successful_items"] += successful_items
            s["failed_items"] += failed_items

    def finish_run(self, run_id: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            r_id = run_id or "global"
            if r_id in self._runs:
                self._runs[r_id]["end_time"] = time.time()
                return self._runs[r_id]
            return {}

    def get_summary(self, run_id: Optional[str] = None) -> str:
        with self._lock:
            r_id = run_id or "global"
            run_data = self._runs.get(r_id)
            if not run_data:
                return "No performance metrics recorded."

            total_duration = (run_data["end_time"] or time.time()) - run_data["start_time"]
            stages = run_data["stages"]

            lines = []
            lines.append("\n============================= AI PIPELINE PERFORMANCE SUMMARY =============================")
            lines.append(f"Run ID: {r_id} | Total Duration: {total_duration:.2f}s")
            lines.append("-" * 90)
            header = f"{'Stage':<24} | {'Provider/Model':<28} | {'Items':<5} | {'APIs':<4} | {'Wait':<6} | {'Exec':<6} | {'Tokens (P/C)'}"
            lines.append(header)
            lines.append("-" * 95)

            total_items = 0
            total_requests = 0
            total_wait = 0.0
            total_exec = 0.0
            total_prompt_tokens = 0
            total_comp_tokens = 0

            for key, data in stages.items():
                stage_label = data["stage"][:24]
                prov_model = f"{data['provider']}/{data['model']}"[:28]
                items = data["items_count"]
                reqs = data["requests_count"]
                wait_s = f"{data['rate_limit_wait']:.2f}s"
                exec_s = f"{data['duration']:.2f}s"
                tokens_str = f"{data['prompt_tokens']}/{data['completion_tokens']}"

                total_items += items
                total_requests += reqs
                total_wait += data["rate_limit_wait"]
                total_exec += data["duration"]
                total_prompt_tokens += data["prompt_tokens"]
                total_comp_tokens += data["completion_tokens"]

                lines.append(
                    f"{stage_label:<22} | {prov_model:<25} | {items:<5} | {reqs:<4} | {wait_s:<6} | {exec_s:<6} | {tokens_str}"
                )

            lines.append("-" * 90)
            tot_wait_s = f"{total_wait:.2f}s"
            tot_exec_s = f"{total_exec:.2f}s"
            tot_tokens = f"{total_prompt_tokens}/{total_comp_tokens}"
            lines.append(
                f"{'TOTALS':<22} | {'All Providers':<25} | {total_items:<5} | {total_requests:<4} | {tot_wait_s:<6} | {tot_exec_s:<6} | {tot_tokens}"
            )
            if total_requests > 0:
                batch_ratio = total_items / total_requests
                lines.append(f"Batching Efficiency: {batch_ratio:.2f} items per API call on average")
            lines.append("===========================================================================================\n")

            return "\n".join(lines)

metrics_collector = PipelineMetrics()
