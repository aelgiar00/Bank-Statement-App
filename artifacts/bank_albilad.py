import pandas as pd
import io
import os
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.pagesizes import A4
import arabic_reshaper
from bidi.algorithm import get_display

# --- تسجيل الخط العربي ---
try:
    font_path = os.path.join(os.path.dirname(__file__), 'arial.ttf') if '__file__' in globals() else 'arial.ttf'
    pdfmetrics.registerFont(TTFont('Arabic', font_path))
    font_name = 'Arabic'
except Exception as e:
    print(f"⚠️ خطأ في تحميل الخط: {e}")
    font_name = 'Helvetica'

def process_arabic_text(text):
    if pd.isna(text) or text == '':
         return ""
    text = str(text).strip()
    reshaped_text = arabic_reshaper.reshape(text)
    return get_display(reshaped_text)

def clean_bank_data(file_path):
    df_raw = pd.read_excel(file_path, header=None)
    header_row = 0
    for i, row in df_raw.iterrows():
        row_str = ' '.join(row.dropna().astype(str))
        if 'التاريخ' in row_str and ('مدين' in row_str or 'دائن' in row_str):
            header_row = i
            break
            
    df = pd.read_excel(file_path, header=header_row)
    df.columns = df.columns.str.strip()
    
    columns_to_keep = ['التاريخ', 'الوصف', 'التفاصيل', 'مدين', 'دائن', 'الرصيد']
    existing_columns = [col for col in columns_to_keep if col in df.columns]
    df = df[existing_columns]
    
    if 'التفاصيل' in df.columns and 'الوصف' in df.columns:
        df['التفاصيل_الكاملة'] = df['الوصف'].astype(str) + " - " + df['التفاصيل'].astype(str)
    elif 'التفاصيل' in df.columns:
        df['التفاصيل_الكاملة'] = df['التفاصيل']
    else:
        df['التفاصيل_الكاملة'] = ''
        
    df = df.dropna(how='all')
    df = df.fillna('')
    
    if str(df.iloc[0].get('التاريخ', '')).strip() == 'هجري':
         df = df.iloc[1:].reset_index(drop=True)
         
    return df

def generate_albilad_full_pdf(excel_file, template_pdf_path, output_pdf_path):
    print("⏳ جاري معالجة وتوزيع كل صفوف الإكسل بالإحداثيات المضبوطة...")
    df = clean_bank_data(excel_file)
    
    if not os.path.exists(template_pdf_path):
        print(f"❌ ملف القالب غير موجود: {template_pdf_path}")
        return
        
    template_pdf = PdfReader(template_pdf_path)
    output_pdf = PdfWriter()
    
    # إحداثيات وثوابت الجدول المظبوطة
    wipe_bottom_y = 80
    top_y = 582
    start_y = 565
    row_height = 24
    max_rows_per_page = 20  # عدد الصفوف في كل صفحة
    
    # الإحداثيات الصحيحة 100% زي النسخة الأصلية الناجحة
    boxes = {
        'الرصيد': (40, 68),
        'دائن': (108, 70),
        'مدين': (178, 70),
        'التفاصيل': (248, 194),
        'التاريخ': (442, 113)
    }
    
    text_x = {
        'التاريخ': 550,     # يمين مربع التاريخ المظبوط
        'التفاصيل': 437,    # يمين مربع التفاصيل
        'مدين': 243,        # يمين مربع مدين
        'دائن': 173,        # يمين مربع دائن
        'الرصيد': 103       # يمين مربع الرصيد
    }
    
    # تقسيم البيانات لـ Chunks (كل 20 صف في صفحة)
    total_rows = len(df)
    chunks = [df[i:i + max_rows_per_page] for i in range(0, total_rows, max_rows_per_page)]
    
    for page_idx, chunk in enumerate(chunks):
        if page_idx >= len(template_pdf.pages):
            break # لو خلصت صفحات القالب الأساسي
            
        template_page = template_pdf.pages[page_idx]
        
        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=A4)
        
        # 1. مسح الجدول القديم في الصفحة دي
        can.setFillColorRGB(1, 1, 1) 
        can.rect(35, wipe_bottom_y, 530, top_y - wipe_bottom_y, fill=True, stroke=False)
        
        num_rows_in_chunk = len(chunk)
        table_height = (num_rows_in_chunk * row_height) + 15
        box_bottom_y = top_y - table_height
        
        # رسم المربعات المنحنية بالمقاسات الصحيحة
        can.setStrokeColorRGB(0, 0, 0)
        can.setLineWidth(1)
        for box_name, (bx, bw) in boxes.items():
            can.roundRect(bx, box_bottom_y, bw, table_height, radius=8, stroke=1, fill=0)
            
        # 2. كتابة البيانات بالدقة المطلوبة
        can.setFillColorRGB(0, 0, 0)
        y = start_y
        
        for index, row in chunk.iterrows():
            date_val = str(row.get('التاريخ', ''))[:10] 
            details_val = str(row.get('التفاصيل_الكاملة', '')).replace('nan - ', '').replace(' - nan', '')
            
            if len(details_val) > 42:
                details_val = details_val[:40] + ".."
                
            debit_val = str(row.get('مدين', ''))
            credit_val = str(row.get('دائن', ''))
            balance_val = str(row.get('الرصيد', ''))
            
            if debit_val.lower() == 'nan': debit_val = ''
            if credit_val.lower() == 'nan': credit_val = ''
            
            can.setFont(font_name, 9)
            can.drawRightString(text_x['التاريخ'], y, process_arabic_text(date_val))
            
            can.setFont(font_name, 8) 
            can.drawRightString(text_x['التفاصيل'], y, process_arabic_text(details_val)) 
            
            can.setFont(font_name, 9)
            can.drawRightString(text_x['مدين'], y, process_arabic_text(debit_val))
            can.drawRightString(text_x['دائن'], y, process_arabic_text(credit_val))
            can.drawRightString(text_x['الرصيد'], y, process_arabic_text(balance_val))
            
            y -= row_height

        can.save()
        packet.seek(0)
        
        new_pdf = PdfReader(packet)
        page_with_data = new_pdf.pages[0]
        template_page.merge_page(page_with_data)
        output_pdf.add_page(template_page)
        
    with open(output_pdf_path, "wb") as outputStream:
        output_pdf.write(outputStream)
        
    print(f"🎉 تم ضبط المحاذاة وتصدير كافة بيانات بنك البلاد بنجاح! الملف: {output_pdf_path} (إجمالي السطور: {total_rows})")

# ==========================================
excel_name = "بنك-البلاد.xlsx"
template_name = "147091696091307.PDF" 
output_name = "Output_AlBilad_Full_Statement.pdf" 

generate_albilad_full_pdf(excel_name, template_name, output_name)