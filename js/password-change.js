(function(root){
  'use strict';
  function validate(currentPassword,newPassword,confirmation){
    if(!currentPassword)return 'Please enter your current password.';
    if(!newPassword||newPassword.length<8)return 'New password must be at least 8 characters long.';
    if(!/[A-Za-z]/.test(newPassword)||!/[0-9]/.test(newPassword))return 'New password must contain both letters and numbers.';
    if(newPassword!==confirmation)return 'New password and confirmation do not match.';
    if(currentPassword===newPassword)return 'New password must be different from current password.';
    return '';
  }
  async function changePassword({createClient,url,anonKey,email,currentPassword,newPassword,confirmation,auth}){
    const validationError=validate(currentPassword,newPassword,confirmation);
    if(validationError)return {error:{message:validationError},stage:'validation'};
    const verifier=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    try{
      const verified=await verifier.auth.signInWithPassword({email,password:currentPassword});
      if(verified.error)return {error:verified.error,stage:'verify'};
      const updated=await auth.updateUser({password:newPassword});
      if(updated.error)return {error:updated.error,stage:'update'};
      const revoked=await auth.signOut({scope:'others'});
      if(revoked.error)return {error:revoked.error,stage:'revoke-others',passwordUpdated:true};
      return {error:null,stage:'complete'};
    }finally{
      try{await verifier.auth.signOut({scope:'local'});}catch(_){}
    }
  }
  root.CarmyPasswordChange={validate,changePassword};
})(globalThis);
