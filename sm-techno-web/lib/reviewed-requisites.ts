import type { CreateClientPayload } from '@/lib/api';
import type { DocumentAssistantPayload } from '@/lib/types';

const legalFields={documentName:'document_name',fullName:'full_name',inn:'inn',kpp:'kpp',ogrn:'ogrn',
  legalAddress:'legal_address',actualAddress:'actual_address',bankName:'bank_name',bankBik:'bank_bik',bankAccount:'bank_account',
  correspondentAccount:'correspondent_account',signerPosition:'signer_position',signerName:'signer_name',signerBasis:'signer_basis',
  contactPerson:'contact_person',email:'email',phone:'phone'} as const;

export function populateClientForm(form: CreateClientPayload,fields: DocumentAssistantPayload): CreateClientPayload {
  const populated={...form};
  for(const [formKey,sourceKey] of Object.entries(legalFields)) {
    Object.assign(populated,{[formKey]:typeof fields[sourceKey]==='string' ? fields[sourceKey] : ''});
  }
  populated.legalType=populated.inn.replace(/\D/g,'').length===12 ? 'individual_entrepreneur' : 'legal_entity';
  if(populated.legalType==='individual_entrepreneur') populated.kpp='';
  return populated;
}

export function clientFormToReviewedFields(form: CreateClientPayload,source: DocumentAssistantPayload): DocumentAssistantPayload {
  const fields={...source};
  for(const [formKey,sourceKey] of Object.entries(legalFields)) fields[sourceKey]=form[formKey as keyof typeof legalFields] ?? '';
  return {...fields,legal_type:form.legalType,is_buyer:form.isBuyer,is_supplier:form.isSupplier,is_inactive:form.isInactive,
    bank_name_or_bik:form.bankNameOrBik,email_note:form.emailNote ?? '',phone_note:form.phoneNote ?? '',notes:form.notes ?? ''};
}
