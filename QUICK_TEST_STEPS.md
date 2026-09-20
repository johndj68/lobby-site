# 🧪 Quick Manual Test Steps

**Status**: System ready to test  
**Server**: http://localhost:3000  
**Prerequisites**: Migration applied to Supabase

---

## ✅ Pre-Flight Checks

### 1. Database Migration Applied?
Open Supabase Dashboard → SQL Editor → Run verification:

```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'app_%'
ORDER BY tablename;
```

**Expected**: 4 rows (app_drafts, app_plans, app_review_checklist, app_submissions)

### 2. Dev Server Running?
```bash
npm run dev
```

Should show: `✓ Ready in 813ms` on port 3000 or 3001

### 3. Auth Working?
Visit: http://localhost:3000/login
- Can you see login page?
- Can you log in with test account?

---

## 🚀 Test Scenario 1: Manual App Registration

### Step 1: Navigate to Vendor Page
1. Go to: **http://localhost:3000/vendedor/aplicativos/novo**
2. If not logged in → redirects to login
3. Log in with test account
4. Should see Step 1 with 2 cards:
   - Card A: "Importar aplicativo por URL"
   - Card B: "Cadastro manual"

**Checklist**:
- [ ] Page loads
- [ ] Both cards visible
- [ ] Information cards below (Avaliação, Próximas etapas, Comissões)

### Step 2: Start Manual Entry
1. Click "Começar cadastro manual" (Card B)
2. Should auto-advance to **Step 2: Produto e mídia**
3. Form appears with fields:
   - Nome do aplicativo (0/100)
   - URL oficial
   - Descrição curta (0/200)
   - Descrição completa
   - Categoria (dropdown)
   - Público-alvo
   - Idiomas

**Checklist**:
- [ ] Step 2 appears
- [ ] Form fields visible
- [ ] Character counters working
- [ ] All inputs focusable

### Step 3: Fill Product Details
1. Fill form:
   - **Nome**: "Test Marketplace App"
   - **URL**: "https://testapp.example.com"
   - **Descrição curta**: "A sample app for testing"
   - **Descrição completa**: "This is a test application for the vendor marketplace system."
   - **Categoria**: "Marketing"
   - **Público-alvo**: "Small businesses"
   - **Idiomas**: "pt, en"

2. Click **"Salvar"** button
3. Watch for spinner → disappears
4. **"Próximo"** button should be enabled

**Checklist**:
- [ ] Form accepts input
- [ ] Character counters update
- [ ] Save button shows spinner
- [ ] Next button enabled after save
- [ ] Data persists (navigate back → values still there)

### Step 4: Add Pricing Plans
1. Click **"Próximo"** → goes to Step 3: Oferta e planos
2. Click **"+ Adicionar plano"**
3. New plan card appears with fields:
   - Nome do plano
   - Preço
   - Modalidade (dropdown)
   - Limite de usuários
   - Nível de suporte (dropdown)
   - Ativação (dropdown)
   - Recursos (textarea)

4. Fill plan:
   - **Nome**: "Starter"
   - **Preço**: "99.00"
   - **Modalidade**: "monthly"
   - **Suporte**: "Email"
   - **Ativação**: "Manual"
   - **Recursos**: "Feature 1\nFeature 2\nFeature 3"

5. Click **"Salvar"**
6. Click **"+ Adicionar plano"** again
7. Add second plan:
   - **Nome**: "Professional"
   - **Preço**: "299.00"
   - **Modalidade**: "monthly"
   - **Suporte**: "Priority"
   - **Ativação**: "API"
   - **Recursos**: "Feature 1\nFeature 2\nFeature 3\nFeature 4\nFeature 5"

8. Click **"Salvar"** then **"Próximo"**

**Checklist**:
- [ ] Add plan button works
- [ ] Plan card renders
- [ ] Plan fields accept input
- [ ] Can add multiple plans
- [ ] Next button enabled with plans
- [ ] Deleting plan works (Trash icon)

### Step 5: Review & Submit
1. Step 4: Revisão e envio appears
2. See preview:
   - **Nome**: Test Marketplace App
   - **Categoria**: Marketing
   - **URL**: https://testapp.example.com
   - **Planos**: 2

3. See warning (if any pending fields) - should be none
4. See checkbox: "Confirmo que tenho autorização..."
5. **Check the checkbox**
6. Click **"Enviar para análise"**
7. Spinner appears
8. Success screen shows:
   - ✅ Icon
   - "Enviado com sucesso!"
   - "Ir para painel" link

9. Click "Ir para painel"

**Checklist**:
- [ ] Preview shows correct data
- [ ] Checkbox required for submit
- [ ] Submit button shows spinner
- [ ] Success message appears
- [ ] Link to dashboard works

---

## 🔐 Test Scenario 2: Security - IP Blocking

### Block Private IPs
1. Return to **http://localhost:3000/vendedor/aplicativos/novo**
2. Create new manual draft (Step 1 → Card B → Step 2 fills in)
3. Go back to **Step 1** (click Step 1 in indicator)
4. Click **"Importar aplicativo por URL"** (Card A)
5. Try blocked URLs one by one:

```
http://127.0.0.1
http://localhost
http://192.168.1.1
http://10.0.0.1
```

**Expected for each**: Error message appears
> "Access to this hostname is not allowed"

No draft created.

**Checklist**:
- [ ] 127.0.0.1 blocked
- [ ] localhost blocked
- [ ] 192.168.* blocked
- [ ] 10.* blocked

### Allow Public URLs
1. Try: `https://google.com`
2. Should show spinner
3. Should auto-fill form with scraped data
4. Auto-advance to Step 2

**Checklist**:
- [ ] Public URL accepted
- [ ] Data scraped (name, description, logo)
- [ ] Form populated

---

## 👨‍💼 Test Scenario 3: Admin Review Panel

### Access Admin Panel
1. Log in with **admin account** (if you have one)
2. Go to: **http://localhost:3000/admin/marketplace/submissoes**
3. Should see submissions list (if any were created)

### Filter & View
1. See filter buttons: "Todas", "Pendentes", "Aprovadas", "Rejeitadas", "Ajustes Solicitados"
2. Click **"Pendentes"** → shows pending submissions
3. Click on submission to expand
4. See JSON data display with:
   - Name
   - Category
   - Plans
   - All other fields

**Checklist**:
- [ ] Admin page accessible (redirects if not admin)
- [ ] Submissions listed
- [ ] Filters work
- [ ] Expand/collapse works
- [ ] Data displayed correctly

---

## 🔄 Test Scenario 4: Data Persistence

### Navigate Between Steps
1. Create new draft → Step 2
2. Fill form completely
3. Click **"Próximo"** → Step 3
4. Click **"← Voltar"** → Back to Step 2
5. **Check**: Form values still there?

**Checklist**:
- [ ] Step 2 values persist
- [ ] Navigation works both ways
- [ ] Data not lost

### Multi-Step Persistence
1. Step 2 → fill + save
2. Step 3 → add plans + save
3. Step 4 → review + submit
4. Should see all data in preview

**Checklist**:
- [ ] All steps save independently
- [ ] Data accumulates correctly
- [ ] Final preview shows everything

---

## 📊 Database Verification

### After Creating Submissions
Open Supabase Dashboard → SQL Editor:

```sql
-- Check drafts created
SELECT 
  id, 
  name, 
  stage, 
  status, 
  organization_id 
FROM app_drafts 
ORDER BY created_at DESC 
LIMIT 5;
```

**Expected**: Rows for each draft created

```sql
-- Check submissions
SELECT 
  id, 
  app_draft_id, 
  status, 
  submitted_at 
FROM app_submissions 
ORDER BY submitted_at DESC 
LIMIT 5;
```

**Expected**: Row for submitted app with status='pending'

```sql
-- Check data snapshot was saved
SELECT 
  id, 
  data->>'name' as app_name,
  data->>'category' as category,
  jsonb_array_length(data->'plans') as plan_count
FROM app_submissions 
ORDER BY submitted_at DESC 
LIMIT 1;
```

**Expected**: Complete snapshot with name, category, plan count

---

## ⚠️ Common Issues

### Page blank / not loading
- Check dev server running: `npm run dev`
- Clear browser cache: Hard refresh (Ctrl+Shift+R)
- Check console for errors (F12 → Console)

### "Unauthorized" on save
- Check user is logged in
- Check user has organization (`user_organizations` table)
- Check auth token valid

### Scrape endpoint returns error
- Check URL is valid + accessible
- Check rate limit (5 per hour)
- Check IP not in blocklist

### Form won't save
- Check required fields filled
- Check browser console for errors
- Try refresh page

### Admin page redirects to /dashboard
- Check user has admin role
- Check `profiles.role = 'admin'` in database

---

## ✅ Success Criteria

All tests pass if:

1. ✅ Can create draft (manual or URL)
2. ✅ Form saves at each step
3. ✅ Navigation preserves data
4. ✅ Can submit with snapshot
5. ✅ Submission appears in database
6. ✅ Admin can see submission
7. ✅ IP blocking works
8. ✅ No console errors
9. ✅ Mobile responsive (devtools toggle)
10. ✅ Success message on submit

---

## 🎬 Next Steps

After passing all manual tests:

1. **Deploy to staging**
2. **User acceptance testing**
3. **Implement Phase 5 features**:
   - Asset uploads
   - Email notifications
   - Advanced admin actions

---

**Estimated test time**: 10-15 minutes per scenario  
**Total**: ~30 minutes for full validation

