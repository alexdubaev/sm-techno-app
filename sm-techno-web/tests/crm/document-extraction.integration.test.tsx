import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DocumentExtractionPanel, ExtractionReview } from '@/components/crm/document-extraction-panel';
import type { DocumentAssistantJob } from '@/lib/types';
import * as api from '@/lib/api';

vi.mock('@/lib/api',() => ({fetchDocumentAssistantJobs:vi.fn(),fetchDocumentAssistantJob:vi.fn(),startDocumentAssistantJob:vi.fn(),uploadDocumentAssistantIntake:vi.fn(),uploadClientDocumentAsset:vi.fn(),confirmDocumentAssistantJob:vi.fn()}));
const job: DocumentAssistantJob={id:'job01',kind:'requisites',clientId:null,assetIds:[10],status:'review',version:3,
  result:{kind:'requisites',payload:{document_name:'ООО Источник',inn:'7701234567',signer_name:null},provenance:[{assetId:10,method:'gpt-6.1-terra',reviewed:false}],missing_fields:['signer_name'],warnings:[]},
  missingFields:['signer_name'],warnings:[],error:null,createdAt:'2026-10-30T12:00:00Z',updatedAt:'2026-10-30T12:00:00Z'};

it('restores a persisted review after refresh, retains corrections on error and confirms edited fields',async () => {
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[job]});
  vi.mocked(api.confirmDocumentAssistantJob).mockRejectedValueOnce(new Error('Проверьте реквизиты')).mockResolvedValueOnce({job:{...job,status:'confirmed',version:4},resultType:'job',resultId:job.id,clientId:null});
  render(<DocumentExtractionPanel />);
  const name=await screen.findByLabelText('Наименование для документов');
  expect(screen.getByText(/Не найдено в источнике: ФИО подписанта/)).toBeVisible();
  fireEvent.change(name,{target:{value:'ООО Исправлено'}});
  fireEvent.change(screen.getByLabelText('ФИО подписанта'),{target:{value:'Тестовый Подписант'}});
  fireEvent.click(screen.getByRole('button',{name:'Подтвердить проверенные поля'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте реквизиты');
  expect(name).toHaveValue('ООО Исправлено');
  fireEvent.click(screen.getByRole('button',{name:'Подтвердить проверенные поля'}));
  await waitFor(() => expect(api.confirmDocumentAssistantJob).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.confirmDocumentAssistantJob).mock.calls[0][1]).toEqual(expect.objectContaining({version:3,action:'review',fields:expect.objectContaining({document_name:'ООО Исправлено',signer_name:'Тестовый Подписант'})}));
  expect(vi.mocked(api.confirmDocumentAssistantJob).mock.calls[0][1].operationKey).toBe(vi.mocked(api.confirmDocumentAssistantJob).mock.calls[1][1].operationKey);
});

it('uploads actor-only input then shows a persisted running job and refresh result',async () => {
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[]});
  vi.mocked(api.uploadDocumentAssistantIntake).mockResolvedValue({id:10} as Awaited<ReturnType<typeof api.uploadDocumentAssistantIntake>>);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue({...job,status:'running',result:null});
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(job);
  render(<DocumentExtractionPanel />);
  const file=new File(['synthetic requisites'],'requisites.txt',{type:'text/plain'});
  await userEvent.upload(screen.getByLabelText('Документ или фото для распознавания'),file);
  fireEvent.submit(screen.getByLabelText('Документ или фото для распознавания').closest('form')!);
  expect(await screen.findByText('Распознаём документ…')).toBeVisible();
  expect(api.uploadDocumentAssistantIntake).toHaveBeenCalledWith(file,'requisites');
  expect(api.startDocumentAssistantJob).toHaveBeenCalledWith({kind:'requisites',assetIds:[10]});
  fireEvent.click(screen.getByRole('button',{name:'Обновить состояние задания'}));
  expect(await screen.findByLabelText('Наименование для документов')).toHaveValue('ООО Источник');
});

it('keeps exact text article codes and edits quantities without trusting client prices',async () => {
  const saved=vi.fn();
  vi.mocked(api.confirmDocumentAssistantJob).mockResolvedValue({job:{...job,status:'confirmed'},resultType:'job',resultId:job.id,clientId:null});
  render(<ExtractionReview job={{...job,kind:'articles',result:{...job.result!,kind:'articles',payload:{rows:[{article:'00123',requested_qty:null,source_row:2}]}}}} onSaved={saved} />);
  expect(screen.getByLabelText('Артикул, строка 1')).toHaveValue('00123');
  fireEvent.change(screen.getByLabelText('Запрошенное количество, строка 1'),{target:{value:'2.5'}});
  fireEvent.click(screen.getByRole('button',{name:'Подтвердить проверенные поля'}));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(api.confirmDocumentAssistantJob).toHaveBeenCalledWith(job.id,expect.objectContaining({fields:{rows:[{article:'00123',requested_qty:'2.5',source_row:2}]}}));
});

it('restores a confirmed review and explicitly passes its fields to the existing create flow',async () => {
  const confirmed={...job,status:'confirmed' as const,version:4};
  const onConfirmed=vi.fn();
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[confirmed]});
  render(<DocumentExtractionPanel onConfirmed={onConfirmed} />);
  fireEvent.click(await screen.findByRole('button',{name:'Использовать проверенные реквизиты'}));
  expect(onConfirmed).toHaveBeenCalledWith(confirmed);
});
