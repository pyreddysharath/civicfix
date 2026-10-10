package com.civicfix.app;
import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.location.*;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    WebView web; final ExecutorService io=Executors.newFixedThreadPool(3);
    final Handler main=new Handler(Looper.getMainLooper());
    SharedPreferences prefs; String captureId,locationId; File captureFile;
    LocationListener listener; LocationManager lm; long captureTime;
    @Override public void onCreate(Bundle state){
        super.onCreate(state); prefs=getSharedPreferences("civicfix",MODE_PRIVATE);
        if(state!=null){captureId=state.getString("captureId"); String f=state.getString("captureFile"); if(f!=null)captureFile=new File(f);captureTime=state.getLong("captureTime");}
        web=new WebView(this); setContentView(web);
        web.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
        WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(),"Native");
        web.setWebViewClient(new WebViewClient(){
            public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri u=request.getUrl();
                if("https".equals(u.getScheme()) && "app.civicfix.local".equals(u.getHost())){
                    String path=u.getPath(); if("/".equals(path))path="/index.html";
                    if(!Arrays.asList("/index.html","/app.js","/style.css").contains(path))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                    try{return new WebResourceResponse(path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":"text/html","UTF-8",getAssets().open(path.substring(1)));}catch(Exception e){return null;}
                }
                return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
            }
            public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){return true;}
        });
        web.loadUrl("https://app.civicfix.local/");
    }
    @Override public void onSaveInstanceState(Bundle s){super.onSaveInstanceState(s);s.putString("captureId",captureId);s.putString("captureFile",captureFile==null?null:captureFile.getAbsolutePath());s.putLong("captureTime",captureTime);}
    void reply(String id,Object result,String error){
        if(id==null)return;
        main.post(()->web.evaluateJavascript("window.nativeReply("+JSONObject.quote(id)+","+(result==null?"null":result.toString())+","+(error==null?"null":JSONObject.quote(error))+")",null));
    }
    class Bridge {
        @JavascriptInterface public String config(){JSONObject j=new JSONObject();try{j.put("server",prefs.getString("server",""));j.put("user",new JSONObject(prefs.getString("user","{}")));}catch(Exception ignored){}return j.toString();}
        @JavascriptInterface public void setServer(String url){
            url=url.trim().replaceAll("/+$","");
            try { URI u=new URI(url); if(u.getHost()==null || u.getUserInfo()!=null || u.getQuery()!=null || u.getFragment()!=null || !("https".equals(u.getScheme()) || (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0 && "http".equals(u.getScheme())))return; }
            catch(Exception e){return;}
            prefs.edit().putString("server",url).remove("token").remove("user").apply();
        }
        @JavascriptInterface public void logout(){prefs.edit().remove("token").remove("user").apply();}
        @JavascriptInterface public void request(String id,String method,String path,String body){io.execute(()->{
            HttpURLConnection c=null;
            try{
                if(!path.startsWith("/") || path.startsWith("//") || path.contains("..") || !(method.equals("GET")||method.equals("POST")))throw new Exception("Invalid request");
                String server=prefs.getString("server","");if(server.isEmpty())throw new Exception("Set the server address under Server connection first.");
                c=(HttpURLConnection)new URL(server+path).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(140000);c.setRequestMethod(method);
                c.setRequestProperty("Authorization","Bearer "+prefs.getString("token",""));
                if(method.equals("POST")){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
                int status=c.getResponseCode();InputStream stream=status>=400?c.getErrorStream():c.getInputStream();
                if(stream==null)throw new Exception("Server returned "+status);
                String raw;try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>60000000)throw new Exception("Response too large");}raw=out.toString("UTF-8");}
                JSONObject result=new JSONObject(raw);
                if(status>=300)throw new Exception(result.optString("error","Server returned "+status));
                if(path.startsWith("/auth/") && result.has("token"))prefs.edit().putString("token",result.getString("token")).putString("user",result.getJSONObject("user").toString()).apply();
                reply(id,result,null);
            }catch(Exception e){reply(id,null,e.getMessage()==null?"Connection failed":e.getMessage());}finally{if(c!=null)c.disconnect();}
        });}
        @JavascriptInterface public void capture(String id){main.post(()->{
            if(captureId!=null){reply(id,null,"Camera is already open");return;}
            try{
                captureId=id;captureTime=System.currentTimeMillis();captureFile=new File(getCacheDir(),"capture_"+UUID.randomUUID()+".jpg");captureFile.createNewFile();
                Uri uri=Uri.parse("content://com.civicfix.app.photos/"+captureFile.getName());
                Intent intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.setClipData(ClipData.newRawUri("Capture",uri));startActivityForResult(intent,90);
            }catch(Exception e){captureId=null;reply(id,null,"Camera unavailable on this device.");}
        });}
        @JavascriptInterface public void choosePhoto(String id){main.post(()->{
            if(captureId!=null){reply(id,null,"Photo picker is already open");return;}
            captureId=id; captureTime=System.currentTimeMillis(); captureFile=null;
            try{
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/jpeg","image/png","image/webp"});
                startActivityForResult(pick,92);
            }catch(Exception e){captureId=null;reply(id,null,"Photo picker unavailable. Please use the camera.");}
        });}
        @JavascriptInterface public void location(String id){main.post(()->{
            if(locationId!=null){reply(id,null,"Location request already running");return;}
            locationId=id;
            if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},91);}
            else locate();
        });}
    }
    void locate(){
        lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        listener=new LocationListener(){
            public void onLocationChanged(Location l){
                if(System.currentTimeMillis()-l.getTime()>120000)return;
                stopLocation();String id=locationId;locationId=null;
                io.execute(()->{JSONObject j=new JSONObject();try{
                    j.put("lat",l.getLatitude());j.put("lon",l.getLongitude());j.put("accuracy",l.getAccuracy());j.put("locationTime",l.getTime()/1000d);
                    if(Geocoder.isPresent())try{List<Address> a=new Geocoder(MainActivity.this,Locale.getDefault()).getFromLocation(l.getLatitude(),l.getLongitude(),1);if(a!=null&&!a.isEmpty()){Address x=a.get(0);j.put("street",x.getThoroughfare());j.put("city",x.getLocality()!=null?x.getLocality():x.getSubAdminArea());j.put("state",x.getAdminArea());j.put("country",x.getCountryName());}}catch(Exception ignored){}
                    reply(id,j,null);
                }catch(Exception e){reply(id,null,"Could not read location");}});
            }
            public void onStatusChanged(String p,int s,Bundle b){}
            public void onProviderEnabled(String p){}
            public void onProviderDisabled(String p){}
        };
        try{
            boolean enabled=false;
            for(String p:Arrays.asList(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER))if(lm.isProviderEnabled(p)){lm.requestLocationUpdates(p,0,0,listener);enabled=true;}
            if(!enabled)throw new Exception();
            final String pending=locationId;
            main.postDelayed(()->{if(pending.equals(locationId)){stopLocation();String id=locationId;locationId=null;reply(id,null,"Location timed out. Turn on location and try outdoors.");}},25000);
        }catch(Exception e){stopLocation();String id=locationId;locationId=null;reply(id,null,"Enable location access in Android settings, then retry.");}
    }
    void stopLocation(){if(lm!=null&&listener!=null)lm.removeUpdates(listener);listener=null;}
    @Override public void onRequestPermissionsResult(int req,String[] permissions,int[] grants){super.onRequestPermissionsResult(req,permissions,grants);if(req==91){if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED)locate();else{reply(locationId,null,"Location permission denied. Enable location access and retry.");locationId=null;}}}
    @Override protected void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data);if(req!=90&&req!=92)return;
        if(req==92){
            final String pickerId=captureId;captureId=null;
            if(result!=RESULT_OK||data==null||data.getData()==null){reply(pickerId,null,"No image selected");return;}
            final Uri picked=data.getData();final long pickedTime=captureTime;
            io.execute(()->{
                File file=null;
                try{
                    file=File.createTempFile("selected_",".jpg",getCacheDir());
                    try(InputStream in=getContentResolver().openInputStream(picked);OutputStream out=new FileOutputStream(file)){
                        if(in==null)throw new IOException();byte[] buffer=new byte[8192];int n,total=0;
                        while((n=in.read(buffer))!=-1){total+=n;if(total>10*1024*1024)throw new IOException();out.write(buffer,0,n);}
                    }
                    encodePhoto(pickerId,file,pickedTime);
                }catch(Exception e){if(file!=null)file.delete();reply(pickerId,null,"Choose a JPEG, PNG or WebP photo under 10 MB.");}
            });return;
        }
        final String id=captureId;final File f=captureFile;final long time=captureTime;captureId=null;
        if(result!=RESULT_OK){if(f!=null)f.delete();reply(id,null,"Camera cancelled");return;}
        io.execute(()->encodePhoto(id,f,time));
    }
    void encodePhoto(String id,File f,long time){
        try{
            BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeFile(f.getAbsolutePath(),bounds);
            if(bounds.outWidth<160||bounds.outHeight<160||((long)bounds.outWidth*bounds.outHeight)>20000000)throw new IOException();
            BitmapFactory.Options opts=new BitmapFactory.Options();opts.inSampleSize=Math.max(1,Math.max(bounds.outWidth,bounds.outHeight)/1600);
            Bitmap bitmap=BitmapFactory.decodeFile(f.getAbsolutePath(),opts);if(bitmap==null)throw new Exception();
            ExifInterface exif=new ExifInterface(f.getAbsolutePath());int orientation=exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);Matrix m=new Matrix();
            switch(orientation){case 2:m.setScale(-1,1);break;case 3:m.setRotate(180);break;case 4:m.setScale(1,-1);break;case 5:m.setRotate(90);m.postScale(-1,1);break;case 6:m.setRotate(90);break;case 7:m.setRotate(-90);m.postScale(-1,1);break;case 8:m.setRotate(-90);break;}
            Bitmap fixed=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),m,true);
            float ratio=Math.min(1,1600f/Math.max(fixed.getWidth(),fixed.getHeight()));Bitmap resized=Bitmap.createScaledBitmap(fixed,Math.max(1,Math.round(fixed.getWidth()*ratio)),Math.max(1,Math.round(fixed.getHeight()*ratio)),true);
            ByteArrayOutputStream out=new ByteArrayOutputStream();resized.compress(Bitmap.CompressFormat.JPEG,85,out);
            JSONObject j=new JSONObject();j.put("photo","data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));j.put("captured",time/1000d);reply(id,j,null);
        }catch(Exception e){reply(id,null,"Unable to read captured photo. Please retry.");}finally{if(f!=null)f.delete();}
    }
    @Override public void onBackPressed(){web.evaluateJavascript("window.appBack()",null);}
    @Override protected void onDestroy(){stopLocation();io.shutdown();super.onDestroy();}
}
