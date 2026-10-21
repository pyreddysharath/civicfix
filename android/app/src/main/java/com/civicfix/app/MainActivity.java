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
        WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setUserAgentString(s.getUserAgentString()+" NenuSaitham/0.6.3 (com.civicfix.app)"); s.setDomStorageEnabled(true); s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(),"Native");
        web.setWebViewClient(new WebViewClient(){
            public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri u=request.getUrl();
                if("https".equals(u.getScheme()) && "app.civicfix.local".equals(u.getHost())){
                    String path=u.getPath(); if("/".equals(path))path="/index.html";
                    if(!Arrays.asList("/index.html","/app.js","/style.css","/leaflet.js","/leaflet.css","/torch-logo.jpg").contains(path))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                    try{return new WebResourceResponse(path.endsWith(".jpg")?"image/jpeg":path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":"text/html","UTF-8",getAssets().open(path.substring(1)));}catch(Exception e){return null;}
                }
                // Only map images may load externally. Scripts remain bundled in the app.
                if("GET".equals(request.getMethod()) && "https".equals(u.getScheme()) && "tile.openstreetmap.org".equals(u.getHost()) && u.getPath().matches("/[0-9]+/[0-9]+/[0-9]+\\.png"))return null;
                return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
            }
            public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();if(req.isForMainFrame() && "https".equals(u.getScheme()) && Arrays.asList("www.openstreetmap.org","osmfoundation.org","leafletjs.com").contains(u.getHost()))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}return true;
            }
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
                c=(HttpURLConnection)new URL(server+path).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(230000);c.setRequestMethod(method);
                c.setRequestProperty("Authorization","Bearer "+prefs.getString("token",""));
                if(method.equals("POST")){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
                int status=c.getResponseCode();InputStream stream=status>=400?c.getErrorStream():c.getInputStream();
                if(stream==null)throw new Exception("Server returned "+status);
                String raw;try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>60000000)throw new Exception("Response too large");}raw=out.toString("UTF-8");}
                JSONObject result=new JSONObject(raw);
                if(status>=300)throw new Exception(result.optString("error","Server returned "+status));
                if(path.startsWith("/auth/") && result.has("token"))prefs.edit().putString("token",result.getString("token")).putString("user",result.getJSONObject("user").toString()).apply();
                if(path.equals("/me"))prefs.edit().putString("user",result.toString()).apply();
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
        @JavascriptInterface public void captureVideo(String id){main.post(()->{
            if(captureId!=null){reply(id,null,"Media picker is already open");return;}
            captureId=id;captureTime=System.currentTimeMillis();captureFile=null;
            try{startActivityForResult(new Intent(MediaStore.ACTION_VIDEO_CAPTURE)
                .putExtra(MediaStore.EXTRA_DURATION_LIMIT,10)
                .putExtra(MediaStore.EXTRA_SIZE_LIMIT,10L*1024*1024)
                .putExtra(MediaStore.EXTRA_VIDEO_QUALITY,0),93);
            }catch(Exception e){captureId=null;reply(id,null,"Video camera unavailable.");}
        });}
        @JavascriptInterface public void choosePhoto(String id){main.post(()->{
            if(captureId!=null){reply(id,null,"Photo picker is already open");return;}
            captureId=id; captureTime=System.currentTimeMillis(); captureFile=null;
            try{
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/jpeg","image/png","image/webp","video/mp4","video/webm","video/quicktime"});
                startActivityForResult(pick,92);
            }catch(Exception e){captureId=null;reply(id,null,"Photo picker unavailable. Please use the camera.");}
        });}
        @JavascriptInterface public void geocode(String id,String query){io.execute(()->{
            try{
                String search=query.trim();if(search.length()<2||search.length()>200)throw new Exception("Enter a city, street or area (2–200 characters).");
                if(!Geocoder.isPresent())throw new Exception("Place search unavailable. Select a point on the map instead.");
                List<Address> addresses=new Geocoder(MainActivity.this,Locale.getDefault()).getFromLocationName(search,5);
                JSONArray items=new JSONArray();if(addresses!=null)for(Address a:addresses)items.put(addressJson(a));
                reply(id,new JSONObject().put("items",items),null);
            }catch(Exception e){reply(id,null,e.getMessage()==null?"Place search unavailable. Try the map.":e.getMessage());}
        });}
        @JavascriptInterface public void reverseGeocode(String id,double lat,double lon){io.execute(()->{
            try{
                if(!Double.isFinite(lat)||!Double.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)throw new Exception("Invalid coordinates");
                JSONObject j=new JSONObject();j.put("lat",lat);j.put("lon",lon);j.put("accuracy",0);
                j=reverseAddress(lat,lon);
                // Retain the chosen point, not a geocoder's nearest address centroid.
                j.put("lat",lat);j.put("lon",lon);reply(id,j,null);
            }catch(Exception e){reply(id,null,"Could not read selected location");}
        });}
        @JavascriptInterface public void location(String id){main.post(()->{
            if(locationId!=null){reply(id,null,"Location request already running");return;}
            locationId=id;
            if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},91);}
            else locate();
        });}
    }
    JSONObject addressJson(Address x) throws JSONException{
        JSONObject j=new JSONObject();j.put("lat",x.getLatitude());j.put("lon",x.getLongitude());j.put("accuracy",0);
        j.put("street",x.getThoroughfare()==null?"":x.getThoroughfare());
        String city=x.getLocality();
        if(city!=null && (city.equalsIgnoreCase(String.valueOf(x.getSubLocality())) || city.equalsIgnoreCase(String.valueOf(x.getThoroughfare()))))city=null;
        j.put("city",city==null?"":city);j.put("area",x.getSubLocality());j.put("district",x.getSubAdminArea());j.put("postcode",x.getPostalCode());
        j.put("state",x.getAdminArea()==null?"":x.getAdminArea());j.put("country",x.getCountryName()==null?"":x.getCountryName());
        j.put("label",x.getMaxAddressLineIndex()>=0?x.getAddressLine(0):j.optString("city"));return j;
    }
    JSONObject reverseAddress(double lat,double lon) throws JSONException{
        JSONObject result=new JSONObject();
        if(Geocoder.isPresent())try{
            List<Address> addresses=new Geocoder(MainActivity.this,Locale.getDefault()).getFromLocation(lat,lon,5);
            if(addresses!=null&&!addresses.isEmpty()){
                result=addressJson(addresses.get(0));
                for(Address address:addresses){
                    JSONObject candidate=addressJson(address);
                    for(String key:Arrays.asList("city","street","area","district","state","country","postcode"))
                        if(result.optString(key,"").isEmpty()&&!candidate.optString(key,"").isEmpty())result.put(key,candidate.get(key));
                }
            }
        }catch(Exception ignored){}
        result.put("lat",lat);result.put("lon",lon);result.put("accuracy",0);return result;
    }
    JSONObject fileDetails(Uri uri,boolean captured) {
        JSONObject meta=new JSONObject();
        try{
            meta.put("source",captured?"Camera":"Upload");meta.put("selected_at",System.currentTimeMillis()/1000d);
            meta.put("mime",getContentResolver().getType(uri));
            try(android.database.Cursor cursor=getContentResolver().query(uri,new String[]{android.provider.OpenableColumns.DISPLAY_NAME,android.provider.OpenableColumns.SIZE},null,null,null)){
                if(cursor!=null&&cursor.moveToFirst()){
                    meta.put("name",cursor.getString(0));if(!cursor.isNull(1))meta.put("original_bytes",cursor.getLong(1));
                }
            }
        }catch(Exception ignored){}
        try(android.database.Cursor cursor=getContentResolver().query(uri,new String[]{android.provider.DocumentsContract.Document.COLUMN_LAST_MODIFIED},null,null,null)){
            if(cursor!=null&&cursor.moveToFirst()&&!cursor.isNull(0))meta.put("last_modified",new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z",Locale.US).format(new Date(cursor.getLong(0))));
        }catch(Exception ignored){}
        return meta;
    }
    void locate(){
        lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        listener=new LocationListener(){
            public void onLocationChanged(Location l){
                if(System.currentTimeMillis()-l.getTime()>120000)return;
                stopLocation();String id=locationId;locationId=null;
                io.execute(()->{JSONObject j=new JSONObject();try{
                    j.put("lat",l.getLatitude());j.put("lon",l.getLongitude());j.put("accuracy",l.getAccuracy());j.put("locationTime",l.getTime()/1000d);
                    j=reverseAddress(l.getLatitude(),l.getLongitude());j.put("accuracy",l.getAccuracy());j.put("locationTime",l.getTime()/1000d);
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
        super.onActivityResult(req,result,data);if(req!=90&&req!=92&&req!=93)return;
        if(req==92||req==93){
            final String pickerId=captureId;captureId=null;
            if(result!=RESULT_OK||data==null||data.getData()==null){reply(pickerId,null,"No media selected");return;}
            final Uri picked=data.getData();final long pickedTime=captureTime;final String mime=getContentResolver().getType(picked);final boolean video=req==93||(mime!=null&&mime.startsWith("video/"));final JSONObject metadata=fileDetails(picked,req==93);
            io.execute(()->{
                File file=null;
                try{
                    file=File.createTempFile("selected_",".jpg",getCacheDir());
                    try(InputStream in=getContentResolver().openInputStream(picked);OutputStream out=new FileOutputStream(file)){
                        if(in==null)throw new IOException();byte[] buffer=new byte[8192];int n,total=0;
                        while((n=in.read(buffer))!=-1){total+=n;if(total>10*1024*1024)throw new IOException();out.write(buffer,0,n);}
                    }
                    if(video)encodeVideo(pickerId,file,pickedTime,mime,metadata);else encodePhoto(pickerId,file,pickedTime,metadata);
                }catch(Exception e){if(file!=null)file.delete();reply(pickerId,null,"Choose a supported photo or video under 10 MB.");}
            });return;
        }
        final String id=captureId;final File f=captureFile;final long time=captureTime;captureId=null;
        if(result!=RESULT_OK){if(f!=null)f.delete();reply(id,null,"Camera cancelled");return;}
        io.execute(()->{JSONObject metadata=new JSONObject();try{metadata.put("name",f.getName());metadata.put("source","Camera");metadata.put("selected_at",time/1000d);metadata.put("mime","image/jpeg");}catch(Exception ignored){}encodePhoto(id,f,time,metadata);});
    }
    void encodeVideo(String id,File file,long time,String mime,JSONObject metadata){
        android.media.MediaMetadataRetriever reader=new android.media.MediaMetadataRetriever();
        try{
            if(file.length()>10*1024*1024)throw new IOException();
            reader.setDataSource(file.getAbsolutePath());
            long duration=Long.parseLong(reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));
            if(duration<=0||duration>10000)throw new IOException();
            if(!Arrays.asList("video/mp4","video/webm","video/quicktime").contains(mime))mime="video/mp4";
            byte[] bytes=java.nio.file.Files.readAllBytes(file.toPath());
            JSONObject j=new JSONObject();j.put("photo","data:"+mime+";base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP));j.put("captured",time/1000d);
            metadata.put("original_bytes",file.length());metadata.put("duration_seconds",duration/1000d);
            metadata.put("width",reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            metadata.put("height",reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            metadata.put("file_created",reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DATE));
            metadata.put("rotation",reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
            metadata.put("embedded_location",reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_LOCATION));j.put("media_metadata",metadata);
            reply(id,j,null);
        }catch(Exception e){reply(id,null,"Choose a readable video up to 10 seconds and under 10 MB.");}
        finally{try{reader.release();}catch(Exception ignored){}file.delete();}
    }
    void encodePhoto(String id,File f,long time,JSONObject metadata){
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
            JSONObject j=new JSONObject();j.put("photo","data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));j.put("captured",time/1000d);
            metadata.put("original_bytes",f.length());metadata.put("width",bounds.outWidth);metadata.put("height",bounds.outHeight);
            metadata.put("saved_width",resized.getWidth());metadata.put("saved_height",resized.getHeight());
            metadata.put("orientation",orientation);metadata.put("camera_make",exif.getAttribute(ExifInterface.TAG_MAKE));metadata.put("camera_model",exif.getAttribute(ExifInterface.TAG_MODEL));
            metadata.put("file_created",exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL));
            float[] gps=new float[2];if(exif.getLatLong(gps)){metadata.put("embedded_lat",gps[0]);metadata.put("embedded_lon",gps[1]);}
            j.put("media_metadata",metadata);reply(id,j,null);
        }catch(Exception e){reply(id,null,"Unable to read captured photo. Please retry.");}finally{if(f!=null)f.delete();}
    }
    @Override public void onBackPressed(){web.evaluateJavascript("window.appBack()",null);}
    @Override protected void onDestroy(){stopLocation();io.shutdown();super.onDestroy();}
}
