import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';

contextBridge.exposeInMainWorld('beim', {
  getDashboardMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.dashboardGetMetrics),
});
