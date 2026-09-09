import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const results=[];
const pass = message=>{results.push(message);console.log('PASS '+message)};
async function run(touch) {
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,isMobile:touch,locale:'fr-FR',timezoneId:'Europe/Paris'});
  const page=await context.newPage();
  page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-09-10T09:00:00Z'));
  await page.addInitScript(()=>localStorage.setItem('idayal:tasks:v1',JSON.stringify(Array.from({length:24},(_,i)=>i===0?'Une tâche à corriger':'Tâche de test '+i).map((title,i)=>({id:'edit-'+i,title,createdDate:'2026-09-10',originalDate:'2026-09-10',scheduledDate:null,completedDate:null,isCarriedOver:false})))));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/');
  const tasks=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('idayal:tasks:v1')||'[]'));
  const nav=async n=>{await page.getByRole('navigation').getByRole('button',{name:new RegExp('^'+n)}).click();await page.waitForTimeout(500)};
  const click=async l=>touch?l.tap():l.click();
  const title=()=>page.getByRole('button',{name:/^Modifier le titre :/}).first();
  const input=()=>page.getByRole('textbox',{name:'Titre de la tâche',exact:true});
  await nav('Aujourd');
  await click(title());
  assert(await input().isVisible());
  await input().fill('Titre corrigé dans la liste');await input().press('Enter');
  assert((await tasks()).some(t=>t.title==='Titre corrigé dans la liste'));
  pass(`${touch?'Tactile':'Souris'} : toucher le titre en liste ouvre l’édition et Entrée enregistre.`);
  await click(title());await input().fill('NE PAS CONSERVER');await input().press('Escape');
  assert(!(await tasks()).some(t=>t.title==='NE PAS CONSERVER'));
  await click(title());await input().fill('  ');await input().press('Enter');
  assert((await tasks()).some(t=>t.title==='Titre corrigé dans la liste'));
  pass(`${touch?'Tactile':'Souris'} : Échap annule et un titre vide conserve la tâche.`);
  await click(title());await input().fill('Annuler par bouton');
  await click(page.getByRole('button',{name:'Annuler la modification',exact:true}));
  assert(!(await tasks()).some(t=>t.title==='Annuler par bouton'));
  await click(title());await input().fill('Enregistré par bouton');
  await click(page.getByRole('button',{name:'Enregistrer le titre',exact:true}));
  assert((await tasks()).some(t=>t.title==='Enregistré par bouton'));
  pass(`${touch?'Tactile':'Souris'} : boutons annuler/enregistrer ne sont pas perturbés par blur.`);
  await nav('Cartes');
  await click(title());
  await input().fill('Titre corrigé sur la carte');await input().press('Enter');
  assert((await tasks()).some(t=>t.title==='Titre corrigé sur la carte'));
  pass(`${touch?'Tactile':'Souris'} : le titre se modifie directement sur la carte.`);
  assert.equal(await page.getByRole('button',{name:'Démarrer',exact:true}).count(),0);
  await click(page.getByRole('button',{name:'Chrono / minuteur',exact:true}));
  await click(page.getByRole('button',{name:'Replier le chrono',exact:true}));
  assert(await page.getByRole('button',{name:'Chrono / minuteur',exact:true}).isVisible());
  await click(page.getByRole('button',{name:'Chrono / minuteur',exact:true}));
  await click(page.getByRole('button',{name:'Démarrer',exact:true}));
  assert(await page.getByRole('button',{name:'Mettre en pause',exact:true}).isVisible());
  await nav('Aujourd');await nav('Cartes');
  assert(await page.getByRole('button',{name:'Mettre en pause',exact:true}).isVisible());
  await click(page.getByRole('button',{name:'Mettre en pause',exact:true}));
  pass(`${touch?'Tactile':'Souris'} : chrono replié au repos, visible et conservé après démarrage/navigation.`);
  await click(page.getByRole('button',{name:'Épingler',exact:true}));
  assert(await page.getByRole('button',{name:'Désépingler',exact:true}).isVisible());
  assert(await page.getByText('Épinglée',{exact:true}).isVisible());
  pass(`${touch?'Tactile':'Souris'} : épingle et libellés explicites fonctionnent.`);
  const drag=async(dx, dy=0, target=title())=>{
    const b=await target.boundingBox();const x=b.x+b.width/2,y=b.y+b.height/2;
    if(touch){
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    }else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();}
    await page.waitForTimeout(600);
  };
  await drag(-150);
  assert(await page.getByRole('dialog',{name:'Le bon moment.'}).isVisible());
  assert.equal(await input().count(),0);
  pass(`${touch?'Tactile':'Souris'} : glisser depuis le titre vers la gauche reprogramme, sans ouvrir l’éditeur.`);
  await page.keyboard.press('Escape');await page.waitForTimeout(500);
  await click(title());await input().fill('Brouillon protégé');await drag(145,0,input());
  assert(await input().isVisible());assert(!(await tasks()).some(t=>t.completedDate));
  await input().press('Escape');
  pass(`${touch?'Tactile':'Souris'} : un glissement dans le champ d’édition ne termine pas la tâche.`);
  await drag(150);
  assert((await tasks()).find(t=>t.title==='Titre corrigé sur la carte').completedDate);
  pass(`${touch?'Tactile':'Souris'} : glisser depuis le titre vers la droite termine la tâche.`);
  await nav('Aujourd');
  const beforeDelete=(await tasks()).length;await drag(-150);assert.equal((await tasks()).length,beforeDelete-1);
  pass(`${touch?'Tactile':'Souris'} : glisser à gauche en liste continue à supprimer.`);
  if(touch){
    const scrollBefore=await page.locator('.today-content').evaluate(e=>e.scrollTop);
    await drag(0,-90);
    const scrollAfter=await page.locator('.today-content').evaluate(e=>e.scrollTop);
    assert(scrollAfter>scrollBefore);assert.equal(await input().count(),0);
    pass('Tactile : le mouvement vertical depuis un titre fait défiler la liste sans l’éditer.');
  }
  assert.deepEqual(errors,[]);
  await context.close();
}
try {await run(false);await run(true);console.log(`${results.length} vérifications réussies.`)}finally{await browser.close()}
