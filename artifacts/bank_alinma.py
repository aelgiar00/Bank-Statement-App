import pandas as pd
import io
import os
import textwrap
from PyPDF2 import PdfReader, PdfWriter, PageObject
from reportlab.pdfgen import canvas
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics

# --- تسجيل الخط العربي ---
try:
    font_path = os.path.join(os.path.dirname(__file__), 'arial.ttf') if '__file__' in globals() else 'arial.ttf'
    pdfmetrics.registerFont(TTFont('Arabic', font_path))
    font_name = 'Arabic'
except Exception as e:
    print(f"⚠️ خطأ في تحميل الخط: {e}")
    font_name = 'Helvetica'

import arabic_reshaper
from bidi.algorithm import get_display

def process_arabic_text(text):
    if pd.isna(text) or str(text).strip() == '' or str(text).lower() == 'nan':
         return ""
    text = str(text).strip()
    reshaped_text = arabic_reshaper.reshape(text)
    return get_display(reshaped_text)

def clean_alinma_data(file_path):
    # جدول الإنماء بيبدأ من الصف 15
    df = pd.read_excel(file_path, header=15)
    df = df.dropna(how='all')
    return df

def generate_alinma_masterpiece(excel_file, template_pdf_path, output_pdf_path):
    print("⏳ جاري إنشاء ملف الإنماء ومعالجة الصفحات الزائدة بذكاء...")
    df = clean_alinma_data(excel_file)
    
    if not os.path.exists(template_pdf_path):
        print(f"❌ ملف القالب غير موجود: {template_pdf_path}")
        return
        
    template_pdf = PdfReader(template_pdf_path)
    output_pdf = PdfWriter()
    
    # 1. إضافة الصفحة الأولى (الغلاف) كما هي
    if len(template_pdf.pages) > 0:
        output_pdf.add_page(template_pdf.pages[0])
        
    # زيادة عدد السطور لـ 15 في الصفحة لاحتواء الـ 5000 عملية
    max_rows_per_page = 15 
    
    # مقاسات وأماكن الخلايا بالملي لشبكة الإنماء
    cells = [
        (498.9, 74.8),  # التاريخ
        (242.7, 252.7), # التفاصيل
        (166.8, 72.3),  # مدين (سحب)
        (95.3, 67.9),   # دائن (إيداع)
        (22.1, 69.9)    # الرصيد
    ]
    
    total_rows = len(df)
    chunks = [df[i:i + max_rows_per_page] for i in range(0, total_rows, max_rows_per_page)]
    
    for page_idx, chunk in enumerate(chunks):
        template_page_idx = page_idx + 1
        
        # إنشاء ملف رسم (Canvas) جديد لكل صفحة
        packet = io.BytesIO()
        # مقاس صفحة الإنماء الأصلي (Letter تقريبا)
        can = canvas.Canvas(packet, pagesize=(612, 792))
        
        # تحديد هل هنستخدم صفحة من القالب ولا هنرسم صفحة بيضاء
        if template_page_idx < len(template_pdf.pages):
            is_template = True
            template_page = template_pdf.pages[template_page_idx]
            # مسح الجدول القديم بالكامل لضمان عدم وجود تداخل
            can.setFillColorRGB(1, 1, 1) 
            can.rect(20, 135, 560, 480, fill=True, stroke=False)
        else:
            # لو الإكسل أطول من القالب، هنعمل صفحة بيضاء نظيفة تماماً 
            # ونرسم فيها الهيدر الأساسي عشان الداتا متبقاش راكبة فوق بعضها
            is_template = False
            template_page = PageObject.create_blank_page(width=612, height=792)
            
            # رسم هيدر أزرق داكن للصفحات الإضافية
            can.setFillColorRGB(0.05, 0.15, 0.25) # لون مشابه لهيدر الإنماء
            can.rect(20, 595, 555, 36, fill=True, stroke=False)
            
            can.setFillColorRGB(1, 1, 1)
            can.setFont(font_name, 8)
            can.drawCentredString(498.9 + (74.8/2), 605, process_arabic_text("التاريخ"))
            can.drawCentredString(242.7 + (252.7/2), 605, process_arabic_text("تفاصيل العملية"))
            can.drawCentredString(166.8 + (72.3/2), 605, process_arabic_text("سحب (مدين)"))
            can.drawCentredString(95.3 + (67.9/2), 605, process_arabic_text("إيداع (دائن)"))
            can.drawCentredString(22.1 + (69.9/2), 605, process_arabic_text("الرصيد"))
        
        # --- رسم الشبكة وإنزال البيانات ---
        for row_idx, (index, row) in enumerate(chunk.iterrows()):
            # تضييق المسافة بين السطور لـ 30.5 بيكسل لاحتواء 15 سطر
            y_top = 591.5 - row_idx * 30.5
            cell_height = 29.5
            
            # 1. رسم المربعات البنفسجية الفاتحة
            can.setFillColorRGB(0.906, 0.898, 0.969)
            for x, w in cells:
                can.rect(x, y_top - cell_height, w, cell_height, fill=True, stroke=False)
            
            # 2. سحب البيانات من الإكسل
            date_val = str(row.iloc[8])[:10] if len(row) > 8 else ''
            desc_val = str(row.iloc[2]) if len(row) > 2 else ''
            credit_debit_val = row.iloc[1] if len(row) > 1 else ''
            balance_val = str(row.iloc[0]) if len(row) > 0 else ''
            
            debit_val = ""
            credit_val = ""
            try:
                amt = float(str(credit_debit_val).replace(',', ''))
                if amt < 0:
                    debit_val = f"{abs(amt):,.2f}"
                elif amt > 0:
                    credit_val = f"{amt:,.2f}"
            except:
                pass
                
            try:
                if balance_val and str(balance_val).lower() != 'nan':
                    balance_val = f"{float(str(balance_val).replace(',', '')):,.2f}"
            except:
                pass

            if str(desc_val).lower() == 'nan': desc_val = ''
            desc_val = str(desc_val).strip()
            
            # 3. تغليف النص وتجهيز الطباعة
            det_lines = textwrap.wrap(desc_val, width=65, break_long_words=True)
            
            can.setFillColorRGB(0, 0, 0)
            can.setFont(font_name, 7.5)
            
            y_center = y_top - 16
            can.drawCentredString(498.9 + (74.8 / 2), y_center, process_arabic_text(date_val))
            can.drawCentredString(166.8 + (72.3 / 2), y_center, process_arabic_text(debit_val))
            can.drawCentredString(95.3 + (67.9 / 2), y_center, process_arabic_text(credit_val))
            can.drawCentredString(22.1 + (69.9 / 2), y_center, process_arabic_text(balance_val))
            
            # التفاصيل بخط أصغر عشان المساحة (3 سطور كحد أقصى)
            can.setFont(font_name, 6.0)
            desc_rx = 242.7 + 252.7 - 5 
            
            num_lines = min(len(det_lines), 3)
            if num_lines == 1:
                start_y_text = y_top - 16
            elif num_lines == 2:
                start_y_text = y_top - 13
            else:
                start_y_text = y_top - 10
                
            line_y = start_y_text
            for i, line in enumerate(det_lines[:3]):
                if i == 2 and len(det_lines) > 3:
                    line = line[:60] + "..."
                can.drawRightString(desc_rx, line_y, process_arabic_text(line))
                line_y -= 7
                
        can.save()
        packet.seek(0)
        
        # دمج الرسمة مع القالب أو الصفحة البيضاء
        new_pdf = PdfReader(packet)
        page_with_data = new_pdf.pages[0]
        template_page.merge_page(page_with_data)
        output_pdf.add_page(template_page)
        
    with open(output_pdf_path, "wb") as outputStream:
        output_pdf.write(outputStream)
        
    # حساب عدد الصفحات المتوقع: 5075 / 15 ≈ 338 صفحة
    print(f"🎉 تم حل المشكلة! الملف الآن معالج بصفحات نظيفة بالكامل: {output_pdf_path}")

# ==========================================
excel_name = r"d:\My Work\College\Projects\First Work\Account-Statement.xls"
template_name = r"d:\My Work\College\Projects\First Work\alainma.pdf" 
output_name = r"d:\My Work\College\Projects\First Work\Output_Alinma_Final.pdf"

generate_alinma_masterpiece(excel_name, template_name, output_name)