package com.civicfix.app;
import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Only random camera files in our private cache are shareable through temporary URI grants. */
public class PhotoProvider extends ContentProvider {
    public boolean onCreate(){ return true; }
    private File file(Uri uri) throws FileNotFoundException {
        String name=uri.getLastPathSegment();
        if(name==null || !name.matches("capture_[a-f0-9-]+\\.jpg")) throw new FileNotFoundException();
        return new File(getContext().getCacheDir(),name);
    }
    public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException { return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.parseMode(mode)); }
    public String getType(Uri uri){ return "image/jpeg"; }
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
        try { File f=file(uri); MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}); c.addRow(new Object[]{f.getName(),f.length()}); return c; }
        catch(Exception e){return null;}
    }
    public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    public int update(Uri uri,ContentValues values,String s,String[] args){throw new UnsupportedOperationException();}
    public int delete(Uri uri,String s,String[] args){throw new UnsupportedOperationException();}
}
