import {test,expect} from './preview-fixture';

test('public header keeps theme and evidence controls without content mode',async({page})=>{
 await page.goto('/?explore=1');
 await expect(page.getByRole('button',{name:'Open content mode',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Content studio',{exact:true})).toHaveCount(0);
 const theme=page.getByRole('button',{name:/Switch to (day|dark) mode/});
 await expect(theme).toBeVisible();
 const before=await theme.getAttribute('aria-label');
 await theme.click();
 await expect(theme).not.toHaveAttribute('aria-label',before!);
 await page.getByRole('button',{name:'About the data',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Every figure has a source.'})).toBeVisible();
});
