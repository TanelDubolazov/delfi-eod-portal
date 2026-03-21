import { ref, watch } from 'vue';

const activeServerId = ref<string | null>(localStorage.getItem('activeServerId'));
const workOffline = ref(localStorage.getItem('workOffline') === 'true');
const deployError = ref<{
  action: string;
  code: string;
  type: 'connection' | 'access' | 'build';
  reversed: boolean;
} | null>(null);

watch(activeServerId, val => {
  if (val) {
    localStorage.setItem('activeServerId', val);
    workOffline.value = false;
    localStorage.removeItem('workOffline');
  } else {
    localStorage.removeItem('activeServerId');
  }
});

watch(workOffline, val => {
  if (val) localStorage.setItem('workOffline', 'true');
  else localStorage.removeItem('workOffline');
});

export function useActiveServer() {
  return { activeServerId, workOffline, deployError };
}
