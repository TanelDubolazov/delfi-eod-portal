import { ref } from 'vue';
import api from './api';
import { useActiveServer } from './useActiveServer';

export type DeployOutcome =
  | { ok: true }
  | { ok: false; type: 'connection' | 'access' | 'build'; code: string };

function classifyError(msg: string): 'connection' | 'access' | 'build' {
  const m = msg.toLowerCase();
  if (m.includes('econnrefused') || m.includes('etimedout') || m.includes('enotfound') || m.includes('timeout') || m.includes('connect')) return 'connection';
  if (m.includes('accessdenied') || m.includes('forbidden') || m.includes('not authorized') || m.includes('403')) return 'access';
  return 'build';
}

export function useDeploy() {
  const { activeServerId, deployError } = useActiveServer();

  const toast = ref<{ visible: boolean; status: 'deploying' | 'success'; message: string }>({
    visible: false,
    status: 'deploying',
    message: '',
  });

  let timer: ReturnType<typeof setTimeout> | null = null;

  function showToast(status: 'deploying' | 'success', message: string) {
    if (timer) clearTimeout(timer);
    toast.value = { visible: true, status, message };
    if (status !== 'deploying') {
      timer = setTimeout(() => { toast.value.visible = false; }, 6000);
    }
  }

  async function triggerDeploy(excludeSlug?: string): Promise<DeployOutcome> {
    const id = activeServerId.value;
    if (!id) return { ok: true };
    deployError.value = null;
    showToast('deploying', 'Building and deploying...');
    try {
      const { data } = await api.post(`/server/${id}/deploy`, excludeSlug ? { excludeSlug } : {});
      if (data.success) {
        showToast('success', `Deployed in ${(data.ms / 1000).toFixed(1)}s`);
        return { ok: true };
      }
      toast.value.visible = false;
      return { ok: false, type: classifyError(data.details || ''), code: data.details || 'Unknown error' };
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Unknown error';
      toast.value.visible = false;
      return { ok: false, type: classifyError(msg), code: msg };
    }
  }

  return { toast, triggerDeploy };
}
