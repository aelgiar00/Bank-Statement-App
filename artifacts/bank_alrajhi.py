import pandas as pd
import io
import os
import textwrap  # مكتبة التغليف الذكي للنصوص
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

def format_money(val):
    try:
        if pd.isna(val) or str(val).strip() == '' or str(val).lower() == 'nan':
            return ''
        num = float(val)
        return f"{num:,.2f} SAR"
    except:
        return str(val)

def clean_rajhi_data(file_path):
    df = pd.read_excel(file_path, header=16)
    df = df.dropna(how='all')
    df = df.fillna('')
    return df

def generate_rajhi_masterpiece(excel_file, template_pdf_path, output_pdf_path):
    print("⏳ جاري تقفيل الجدول وضبط التفاصيل لتلزم حدودها باحترافية...")
    df = clean_rajhi_data(excel_file)
    
    if not os.path.exists(template_pdf_path):
        print(f"❌ ملف القالب غير موجود: {template_pdf_path}")
        return
        
    template_pdf = PdfReader(template_pdf_path)
    output_pdf = PdfWriter()
    
    if len(template_pdf.pages) > 0:
        output_pdf.add_page(template_pdf.pages[0])
        
    row_height = 26
    max_rows_per_page = 27 
    
    total_rows = len(df)
    chunks = [df[i:i + max_rows_per_page] for i in range(0, total_rows, max_rows_per_page)]
    
    for page_idx, chunk in enumerate(chunks):
        template_page_idx = page_idx + 1
        if template_page_idx < len(template_pdf.pages):
            template_page = template_pdf.pages[template_page_idx]
        else:
            fresh_reader = PdfReader(template_pdf_path)
            template_page = fresh_reader.pages[-1]
            
        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=A4)
        
        # مسح شامل وتجهيز الخلفية
        can.setFillColorRGB(1, 1, 1)
        can.rect(30, 30, 535, 785, fill=True, stroke=False)
        
        # بناء الهيدر الأزرق
        header_y = 790
        can.setFillColorRGB(0.08, 0.1, 0.85) 
        can.rect(40, header_y, 515, 25, fill=True, stroke=False)
        
        can.setFillColorRGB(1, 1, 1)
        can.setFont(font_name, 10)
        can.drawCentredString(87, header_y + 8, process_arabic_text("الرصيد"))
        can.drawCentredString(180, header_y + 8, process_arabic_text("دائن"))
        can.drawCentredString(270, header_y + 8, process_arabic_text("مدين"))
        can.drawCentredString(400, header_y + 8, process_arabic_text("تفاصيل العملية"))
        can.drawCentredString(520, header_y + 8, process_arabic_text("التاريخ"))
        
        can.setStrokeColorRGB(1, 1, 1)
        can.setLineWidth(1)
        for x_line in [135, 225, 315, 485]:
            can.line(x_line, header_y, x_line, header_y + 25)
        
        y = header_y
        
        for row_idx, (index, row) in enumerate(chunk.iterrows()):
            if row_idx % 2 == 0:
                can.setFillColorRGB(0.95, 0.95, 0.95)
            else:
                can.setFillColorRGB(1, 1, 1)
            can.rect(40, y - row_height, 445, row_height, fill=True, stroke=False)
            
            can.setFillColorRGB(0.08, 0.1, 0.85)
            can.rect(485, y - row_height, 70, row_height, fill=True, stroke=False)
            
            can.setStrokeColorRGB(1, 1, 1)
            for x_line in [135, 225, 315, 485]:
                can.line(x_line, y - row_height, x_line, y)
            
            date_val = str(row.iloc[11])[:10] if len(row) > 11 else ''
            desc_val = str(row.iloc[9]) if len(row) > 9 else ''
            det_val = str(row.iloc[10]) if len(row) > 10 else ''
            debit_val = str(row.iloc[7]) if len(row) > 7 else ''
            credit_val = str(row.iloc[8]) if len(row) > 8 else ''
            balance_val = str(row.iloc[6]) if len(row) > 6 else ''
            
            if desc_val.lower() == 'nan': desc_val = ''
            if det_val.lower() == 'nan': det_val = ''
            
            # --- السر الجديد: فلترة وتقسيم النصوص بدقة ---
            desc_val = desc_val.strip()
            det_val = det_val.strip()
            
            # قص العنوان الرئيسي
            desc_line = desc_val[:38] + (".." if len(desc_val) > 38 else "")
            
            # استخدام textwrap لتقسيم الأكواد الطويلة (زي Payment) لأقصى حد 38 حرف للسطر
            det_lines = textwrap.wrap(det_val, width=38, break_long_words=True)
            
            det_line1 = det_lines[0] if len(det_lines) > 0 else ""
            det_line2 = det_lines[1] if len(det_lines) > 1 else ""
            
            # لو النص طويل جداً أكتر من سطرين، نحط نقط في الآخر
            if len(det_lines) > 2:
                det_line2 = det_line2[:36] + ".."
            
            # --- الطباعة ---
            text_y = y - 15
            
            can.setFillColorRGB(1, 1, 1)
            can.setFont(font_name, 9)
            can.drawCentredString(520, text_y, process_arabic_text(date_val))
            
            can.setFillColorRGB(0, 0, 0)
            can.setFont(font_name, 8.5)
            can.drawCentredString(270, text_y, process_arabic_text(format_money(debit_val)))
            can.drawCentredString(180, text_y, process_arabic_text(format_money(credit_val)))
            can.drawCentredString(87, text_y, process_arabic_text(format_money(balance_val)))
            
            if det_val:
                can.setFont(font_name, 8)
                can.drawRightString(480, y - 9, process_arabic_text(desc_line))
                can.setFont(font_name, 6.5)
                can.drawRightString(480, y - 17, process_arabic_text(det_line1))
                if det_line2:
                    can.drawRightString(480, y - 24, process_arabic_text(det_line2))
            else:
                can.setFont(font_name, 8)
                can.drawRightString(480, y - 15, process_arabic_text(desc_line))
            
            y -= row_height

        can.setStrokeColorRGB(0.08, 0.1, 0.85)
        can.line(40, y, 555, y)

        can.save()
        packet.seek(0)
        
        new_pdf = PdfReader(packet)
        page_with_data = new_pdf.pages[0]
        template_page.merge_page(page_with_data)
        output_pdf.add_page(template_page)
        
    with open(output_pdf_path, "wb") as outputStream:
        output_pdf.write(outputStream)
        
    print(f"🎉 احترافية 100%! تم تطبيق التغليف الذكي والجدول طالع فابريكا: {output_pdf_path}")

# ==========================================
excel_name = "449000010006215300025478.xlsx"
template_name = "كشف-حساب-جاري.PDF" 
output_name = "Output_Rajhi_Perfect_Wrapped.pdf" 

generate_rajhi_masterpiece(excel_name, template_name, output_name)