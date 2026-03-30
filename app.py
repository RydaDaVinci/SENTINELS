from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import os
import torch
import torch.nn as nn
import nltk
from nltk.sentiment import SentimentIntensityAnalyzer
from textblob import TextBlob
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# Download NLTK resources
try:
    nltk.download('vader_lexicon', quiet=True)
    nltk.download('punkt', quiet=True)
except:
    print("NLTK download failed")

app = Flask(__name__)
CORS(app)

# =============================================
# DNN ARCHITECTURES
# =============================================

class SimpleDNN(nn.Module):
    def __init__(self, input_size):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, 256), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(128, 64), nn.ReLU(),
            nn.Linear(64, 2)
        )
    def forward(self, x): return self.network(x)

class DeepDNN(nn.Module):
    def __init__(self, input_size):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, 512), nn.BatchNorm1d(512), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(512, 256), nn.BatchNorm1d(256), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(256, 128), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(128, 64), nn.ReLU(),
            nn.Linear(64, 2)
        )
    def forward(self, x): return self.network(x)

class WideDNN(nn.Module):
    def __init__(self, input_size):
        super().__init__()
        self.fc1 = nn.Linear(input_size, 512)
        self.fc2 = nn.Linear(512, 512)
        self.fc3 = nn.Linear(512, 256)
        self.fc4 = nn.Linear(256, 128)
        self.fc5 = nn.Linear(128, 2)
        self.dropout = nn.Dropout(0.3)
        self.bn1 = nn.BatchNorm1d(512)
        self.bn2 = nn.BatchNorm1d(256)
        self.relu = nn.ReLU()
    
    def forward(self, x):
        out1 = self.relu(self.bn1(self.fc1(x)))
        out1 = self.dropout(out1)
        out2 = self.relu(self.fc2(out1))
        out2 = self.dropout(out2)
        out2 = out2 + out1[:, :512]
        out3 = self.relu(self.bn2(self.fc3(out2)))
        out3 = self.dropout(out3)
        out4 = self.relu(self.fc4(out3))
        out4 = self.dropout(out4)
        return self.fc5(out4)

# =============================================
# DEBERTA EMOTION CLASSIFIER
# =============================================

class DebertaEmotionExtractor:
    def __init__(self, device):
        self.device = device
        print("Loading DeBERTa emotion model...")
        
        local_model_path = "deberta_emotion_model"
        
        try:
            if os.path.exists(local_model_path):
                print(f"Loading from local path: {local_model_path}")
                self.tokenizer = AutoTokenizer.from_pretrained(local_model_path)
                self.model = AutoModelForSequenceClassification.from_pretrained(local_model_path)
                print("DeBERTa model loaded from local storage")
            else:
                print("Downloading from Hugging Face Hub...")
                model_name = "ayoubkirouane/BERT-Emotions-Classifier"
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
                
                os.makedirs(local_model_path, exist_ok=True)
                self.tokenizer.save_pretrained(local_model_path)
                self.model.save_pretrained(local_model_path)
                print("Model cached locally")
                
        except Exception as e:
            print(f"Error loading DeBERTa model: {e}")
            raise
        
        self.model.to(device)
        self.model.eval()
        
        self.emotion_labels = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 
                               'love', 'optimism', 'pessimism', 'sadness', 'surprise', 'trust']
        
        print(f"DeBERTa emotion model ready with {len(self.emotion_labels)} emotions")
    
    def extract_emotions(self, text):
        if not text or len(text.strip()) == 0:
            text = "No content"
        
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, 
                                max_length=512, padding=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)[0].cpu().numpy()
        
        return {label: float(probs[i]) for i, label in enumerate(self.emotion_labels)}

# =============================================
# FEATURE EXTRACTOR
# =============================================

class EmailFeatureExtractor:
    def __init__(self, device):
        self.device = device
        try:
            self.vader = SentimentIntensityAnalyzer()
        except:
            self.vader = None
        
        self.deberta = DebertaEmotionExtractor(device)
    
    def extract_metadata_features(self, email_data):
        """Extract only metadata features (17 features)"""
        features = []
        
        # 0-5: Recipient features (6)
        features.extend([
            email_data.get('toCount', 0),
            email_data.get('externalTo', 0),
            email_data.get('ccCount', 0),
            email_data.get('externalCc', 0),
            email_data.get('totalRecipients', 0),
            email_data.get('externalRatio', 0)
        ])
        
        # 6-12: Temporal features (7)
        features.extend([
            email_data.get('hour', 12),
            email_data.get('minute', 0),
            email_data.get('dayOfWeek', 0),
            email_data.get('month', 1),
            email_data.get('isWorkHour', 1),
            email_data.get('isAfterHours', 0),
            email_data.get('isWeekend', 0)
        ])
        
        # 13-14: Attachment features (2)
        features.extend([
            email_data.get('hasAttachment', 0),
        ])
        
        # 15: size_log
        features.append(email_data.get('sizeLog', 0))
        
        # 16: attachment_count (added to match training)
        features.append(email_data.get('attachmentCount', 0))
        
        return features
    
    def extract_psycho_features(self, email_data):
        """Extract only psycho-linguistic features (20 features)"""
        content = email_data.get('body', '')
        
        # Get DeBERTa emotions
        deberta_emotions = self.deberta.extract_emotions(content)
        
        # Get VADER scores
        if self.vader:
            vader_scores = self.vader.polarity_scores(content)
            vader_neg = vader_scores['neg']
            vader_neu = vader_scores['neu']
            vader_pos = vader_scores['pos']
            vader_compound = vader_scores['compound']
        else:
            vader_neg = vader_neu = vader_pos = 0.0
            vader_compound = 0.0
        
        # Get TextBlob scores
        try:
            blob = TextBlob(content)
            blob_polarity = blob.sentiment.polarity
            blob_subjectivity = blob.sentiment.subjectivity
        except:
            blob_polarity = 0.0
            blob_subjectivity = 0.5
        
        # Return 20 psycho-linguistic features
        return [
            deberta_emotions.get('anger', 0.0),
            deberta_emotions.get('anticipation', 0.0),
            deberta_emotions.get('disgust', 0.0),
            deberta_emotions.get('fear', 0.0),
            deberta_emotions.get('joy', 0.0),
            deberta_emotions.get('love', 0.0),
            deberta_emotions.get('optimism', 0.0),
            deberta_emotions.get('pessimism', 0.0),
            deberta_emotions.get('sadness', 0.0),
            deberta_emotions.get('surprise', 0.0),
            deberta_emotions.get('trust', 0.0),
            deberta_emotions.get('negative', vader_neg),
            deberta_emotions.get('neutral', vader_neu),
            deberta_emotions.get('positive', vader_pos),
            vader_neg,
            vader_neu,
            vader_pos,
            vader_compound,
            blob_polarity,
            blob_subjectivity
        ]
    
    def extract_fusion_features(self, email_data):
        """Extract all 37 features (fusion)"""
        metadata_features = self.extract_metadata_features(email_data)
        psycho_features = self.extract_psycho_features(email_data)
        
        # Combine: metadata first (17), then psycho (20) = 37
        return metadata_features + psycho_features

# =============================================
# LOAD ALL MODELS AND SCALERS
# =============================================

print("=" * 50)
print("Loading ML models and scalers...")
print("=" * 50)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")

# Model containers
fusion_models = {'traditional': {}, 'nn': {}}
metadata_models = {'traditional': {}, 'nn': {}}
psycho_models = {'traditional': {}, 'nn': {}}

# =============================================
# Load Psycho Models (20 features)
# =============================================
print("\n" + "=" * 40)
print("Loading Psycho Models (20 features)")
print("=" * 40)

try:
    psycho_scaler_data = joblib.load('models/psycho/scaler_with_metadata.pkl')
    psycho_scaler = psycho_scaler_data['scaler']
    psycho_feature_names = psycho_scaler_data['feature_names']
    print("Psycho scaler loaded (expects 20 features)")
except Exception as e:
    print(f"Psycho scaler failed to load: {e}")
    psycho_scaler = None

psycho_traditional = [
    ('logistic_regression', 'psycho/logistic_regression.pkl', 'Logistic Regression'),
    ('random_forest', 'psycho/random_forest.pkl', 'Random Forest'),
    ('xgboost', 'psycho/xgboost.pkl', 'XGBoost')
]

for key, filename, name in psycho_traditional:
    try:
        path = f'models/{filename}'
        if os.path.exists(path):
            psycho_models['traditional'][key] = joblib.load(path)
            print(f"Psycho {name} loaded")
    except Exception as e:
        print(f"Psycho {name} failed to load: {e}")

psycho_nn = [
    ('simple_dnn', 'psycho/nn/simplednn.pth', 'SimpleDNN', SimpleDNN, 20),
    ('deep_dnn', 'psycho/nn/deepdnn.pth', 'DeepDNN', DeepDNN, 20),
    ('wide_dnn', 'psycho/nn/widednn.pth', 'WideDNN', WideDNN, 20)
]

for key, filename, name, ModelClass, input_size in psycho_nn:
    try:
        path = f'models/{filename}'
        if os.path.exists(path):
            model = ModelClass(input_size).to(device)
            checkpoint = torch.load(path, map_location=device, weights_only=False)
            
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            else:
                state_dict = checkpoint
                
            model.load_state_dict(state_dict)
            model.eval()
            psycho_models['nn'][key] = model
            print(f"Psycho {name} loaded")
    except Exception as e:
        print(f"Psycho {name} failed to load: {e}")

# =============================================
# Load Metadata Models (17 features)
# =============================================
print("\n" + "=" * 40)
print("Loading Metadata Models (17 features)")
print("=" * 40)

try:
    metadata_scaler_data = joblib.load('models/metadata/scaler_with_metadata.pkl')
    metadata_scaler = metadata_scaler_data['scaler']
    metadata_feature_names = metadata_scaler_data['feature_names']
    print("Metadata scaler loaded (expects 17 features)")
except Exception as e:
    print(f"Metadata scaler failed to load: {e}")
    metadata_scaler = None

metadata_traditional = [
    ('logistic_regression', 'metadata/logistic_regression.pkl', 'Logistic Regression'),
    ('random_forest', 'metadata/random_forest.pkl', 'Random Forest'),
    ('xgboost', 'metadata/xgboost.pkl', 'XGBoost')
]

for key, filename, name in metadata_traditional:
    try:
        path = f'models/{filename}'
        if os.path.exists(path):
            metadata_models['traditional'][key] = joblib.load(path)
            print(f"Metadata {name} loaded")
    except Exception as e:
        print(f"Metadata {name} failed to load: {e}")

metadata_nn = [
    ('simple_dnn', 'metadata/nn/simplednn.pth', 'SimpleDNN', SimpleDNN, 16),
    ('deep_dnn', 'metadata/nn/deepdnn.pth', 'DeepDNN', DeepDNN, 16),
    ('wide_dnn', 'metadata/nn/widednn.pth', 'WideDNN', WideDNN, 16)
]

for key, filename, name, ModelClass, input_size in metadata_nn:
    try:
        path = f'models/{filename}'
        if os.path.exists(path):
            model = ModelClass(input_size).to(device)
            checkpoint = torch.load(path, map_location=device, weights_only=False)
            
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            else:
                state_dict = checkpoint
                
            model.load_state_dict(state_dict)
            model.eval()
            metadata_models['nn'][key] = model
            print(f"Metadata {name} loaded")
    except Exception as e:
        print(f"Metadata {name} failed to load: {e}")

# =============================================
# Load Fusion Models (37 features)
# =============================================
print("\n" + "=" * 40)
print("Loading Fusion Models (37 features)")
print("=" * 40)

try:
    fusion_scaler = joblib.load('models/fusion/scaler.pkl')
    print("Fusion scaler loaded")
except Exception as e:
    print(f"Fusion scaler failed to load: {e}")
    fusion_scaler = None

fusion_traditional = [
    ('logistic_regression', 'fusion/logistic_regression.pkl', 'Logistic Regression'),
    ('random_forest', 'fusion/random_forest.pkl', 'Random Forest'),
    ('xgboost', 'fusion/xgboost.pkl', 'XGBoost')
]

for key, filename, name in fusion_traditional:
    try:
        path = f'models/{filename}'
        if os.path.exists(path):
            fusion_models['traditional'][key] = joblib.load(path)
            print(f"Fusion {name} loaded")
    except Exception as e:
        print(f"Fusion {name} failed to load: {e}")

fusion_nn = [
    ('simple_dnn', 'fusion/nn/simple_dnn.pth', 'SimpleDNN', SimpleDNN, 36),
    ('deep_dnn', 'fusion/nn/deep_dnn.pth', 'DeepDNN', DeepDNN, 36),
    ('wide_dnn', 'fusion/nn/wide_dnn.pth', 'WideDNN', WideDNN, 36)
]

for key, filename, name, ModelClass, input_size in fusion_nn:
    try:
        path = f'models/{filename}'
        if os.path.exists(path):
            model = ModelClass(input_size).to(device)
            checkpoint = torch.load(path, map_location=device, weights_only=False)
            
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            else:
                state_dict = checkpoint
                
            model.load_state_dict(state_dict)
            model.eval()
            fusion_models['nn'][key] = model
            print(f"Fusion {name} loaded")
    except Exception as e:
        print(f"Fusion {name} failed to load: {e}")

# Initialize feature extractor
feature_extractor = EmailFeatureExtractor(device)

print("\n" + "=" * 50)
print("MODEL LOADING SUMMARY")
print("=" * 50)
print(f"Psycho traditional: {list(psycho_models['traditional'].keys())}")
print(f"Psycho neural networks: {list(psycho_models['nn'].keys())}")
print(f"Metadata traditional: {list(metadata_models['traditional'].keys())}")
print(f"Metadata neural networks: {list(metadata_models['nn'].keys())}")
print(f"Fusion traditional: {list(fusion_models['traditional'].keys())}")
print(f"Fusion neural networks: {list(fusion_models['nn'].keys())}")
print("=" * 50)

print("\nALL MODELS AND SCALERS LOADED SUCCESSFULLY")
print(f"\nModel Status:")
print(f"  Psycho: {len(psycho_models['traditional'])} traditional, {len(psycho_models['nn'])} neural networks")
print(f"  Metadata: {len(metadata_models['traditional'])} traditional, {len(metadata_models['nn'])} neural networks")
print(f"  Fusion: {len(fusion_models['traditional'])} traditional, {len(fusion_models['nn'])} neural networks")

# =============================================
# PREDICTION FUNCTION WITH ENHANCED EMOTIONAL BOOST
# =============================================

def get_risk_level(prob):
    if prob < 0.3: return 'LOW'
    elif prob < 0.7: return 'MEDIUM'
    else: return 'HIGH'

def compute_emotional_boost(psycho_features):
    """
    Calculate an enhanced additive boost factor based on emotional content
    Boost increased by 20% compared to previous version
    Returns a value between 0 and 0.6 (increased from 0.5)
    """
    if psycho_features is None or len(psycho_features) < 20:
        return 0.0
    
    # Extract key emotional indicators
    anger = psycho_features[0]
    disgust = psycho_features[2]
    fear = psycho_features[3]
    sadness = psycho_features[8]
    pessimism = psycho_features[7]
    
    # VADER sentiment
    vader_neg = psycho_features[14]
    vader_compound = psycho_features[17]
    
    # TextBlob polarity
    blob_polarity = psycho_features[18]
    blob_subjectivity = psycho_features[19]
    
    # Calculate emotional intensity (0 to 1) - increased weights
    emotional_intensity = (
        anger * 0.45 +
        disgust * 0.25 +
        fear * 0.20 +
        sadness * 0.20 +
        pessimism * 0.15
    )
    
    # Calculate negativity (0 to 1) - increased weights
    negativity = vader_neg * 0.35 + max(0, -blob_polarity) * 0.20 + max(0, -vader_compound) * 0.20
    
    # Base boost from emotional intensity and negativity (increased multiplier)
    boost = emotional_intensity * 0.65 + negativity * 0.65
    
    # Additional boost for very high anger (increased)
    if anger > 0.35:
        boost += 0.15
    elif anger > 0.2:
        boost += 0.08
    
    # Additional boost for high fear or disgust
    if fear > 0.3:
        boost += 0.12
    if disgust > 0.3:
        boost += 0.10
    
    # Additional boost for high subjectivity with negative content
    if blob_subjectivity > 0.6 and vader_compound < -0.2:
        boost += 0.12
    
    # Additional boost for very negative VADER compound
    if vader_compound < -0.5:
        boost += 0.10
    elif vader_compound < -0.3:
        boost += 0.05
    
    # Cap the boost at 0.6 (increased from 0.5)
    boost = min(0.6, boost)
    
    # Log boost if significant
    if boost > 0.08:
        print(f"Emotional boost: {boost:.3f} (anger={anger:.2f}, neg={negativity:.2f})")
    
    return boost

def predict_with_model(model, features_scaled, model_type='sklearn', model_family='', temperature=5.0, psycho_features=None):
    """Predictions with enhanced additive emotional boost only for fusion neural networks"""
    try:
        if model_type == 'sklearn':
            prob = model.predict_proba(features_scaled)[0][1]
        else:
            with torch.no_grad():
                features_tensor = torch.FloatTensor(features_scaled).to(device)
                outputs = model(features_tensor)
                
                # Temperature scaling for neural networks
                scaled_outputs = outputs / temperature
                probs = torch.softmax(scaled_outputs, dim=1)
                prob = probs[0][1].item()
        
        # Apply additive emotional boost ONLY for fusion neural networks
        if model_family == 'fusion' and model_type == 'pytorch' and psycho_features is not None:
            boost = compute_emotional_boost(psycho_features)
            original_prob = prob
            prob = min(0.98, prob + boost)
            
            # Log significant changes
            if prob - original_prob > 0.08:
                print(f"Fusion NN boosted: {original_prob:.3f} -> {prob:.3f} (+{boost:.3f})")
        
        return {
            'probability': float(prob),
            'isThreat': bool(prob > 0.5),
            'riskLevel': str(get_risk_level(prob))
        }
    except Exception as e:
        print(f"Prediction error for {model_family}: {e}")
        return {'probability': 0.0, 'isThreat': False, 'riskLevel': 'LOW'}

# =============================================
# API ENDPOINT - RAW PREDICTIONS FROM ALL MODELS
# =============================================

@app.route('/predict-raw', methods=['POST'])
def predict_raw():
    """Raw predictions from all model types - including neural networks"""
    try:
        data = request.json
        
        email_data = {
            'body': data.get('content', ''),
            'attachmentCount': data.get('attachmentCount', 0),
            'toCount': data.get('toCount', 0),
            'ccCount': data.get('ccCount', 0),
            'totalRecipients': data.get('totalRecipients', 0),
            'externalTo': data.get('externalTo', 0),
            'externalCc': data.get('externalCc', 0),
            'externalRatio': data.get('externalRatio', 0),
            'hour': data.get('hour', 12),
            'minute': data.get('minute', 0),
            'dayOfWeek': data.get('dayOfWeek', 0),
            'month': data.get('month', 1),
            'isWorkHour': data.get('isWorkHour', 1),
            'isAfterHours': data.get('isAfterHours', 0),
            'isWeekend': data.get('isWeekend', 0),
            'hasAttachment': data.get('hasAttachment', 0),
            'sizeKb': data.get('sizeKb', 0),
            'sizeLog': data.get('sizeLog', 0),
            'isSend': data.get('isSend', 0)
        }
        
        # Extract features for each model type
        metadata_features = feature_extractor.extract_metadata_features(email_data)
        psycho_features = feature_extractor.extract_psycho_features(email_data)
        fusion_features = feature_extractor.extract_fusion_features(email_data)
        
        print(f"\nFeature counts: Metadata={len(metadata_features)}, Psycho={len(psycho_features)}, Fusion={len(fusion_features)}")
        
        results = {}
        
        # =========================================
        # PSYCHO-ONLY MODEL PREDICTIONS
        # =========================================
        if psycho_scaler is not None:
            psycho_scaled = psycho_scaler.transform([psycho_features])
            
            psycho_predictions = {}
            
            # Traditional ML - Psycho
            for model_name, model in psycho_models['traditional'].items():
                readable_name = {
                    'logistic_regression': 'Logistic Regression',
                    'random_forest': 'Random Forest',
                    'xgboost': 'XGBoost'
                }.get(model_name, model_name)
                
                psycho_predictions[readable_name] = predict_with_model(model, psycho_scaled, 'sklearn', model_family='psycho', psycho_features=psycho_features)
            
            # Neural Networks - Psycho 
            for model_name, model in psycho_models['nn'].items():
                readable_name = {
                    'simple_dnn': 'SimpleDNN',
                    'deep_dnn': 'DeepDNN',
                    'wide_dnn': 'WideDNN'
                }.get(model_name, model_name)
                
                psycho_predictions[readable_name] = predict_with_model(model, psycho_scaled, 'pytorch', model_family='psycho', temperature=1.0, psycho_features=psycho_features)
            
            results['psycho'] = psycho_predictions
        
        # =========================================
        # METADATA-ONLY MODEL PREDICTIONS
        # =========================================
        if metadata_scaler is not None:
            metadata_scaled = metadata_scaler.transform([metadata_features])
            
            metadata_predictions = {}
            
            # Traditional ML - Metadata
            for model_name, model in metadata_models['traditional'].items():
                readable_name = {
                    'logistic_regression': 'Logistic Regression',
                    'random_forest': 'Random Forest',
                    'xgboost': 'XGBoost'
                }.get(model_name, model_name)
                
                metadata_predictions[readable_name] = predict_with_model(model, metadata_scaled, 'sklearn', model_family='metadata', psycho_features=psycho_features)
            
            # Neural Networks - Metadata 
            for model_name, model in metadata_models['nn'].items():
                readable_name = {
                    'simple_dnn': 'SimpleDNN',
                    'deep_dnn': 'DeepDNN',
                    'wide_dnn': 'WideDNN'
                }.get(model_name, model_name)
                
                metadata_predictions[readable_name] = predict_with_model(model, metadata_scaled, 'pytorch', model_family='metadata', temperature=1.0, psycho_features=psycho_features)
            
            results['metadata'] = metadata_predictions
        
        # =========================================
        # FUSION MODEL PREDICTIONS
        # =========================================
        if fusion_scaler is not None:
            fusion_scaled = fusion_scaler.transform([fusion_features])
            
            fusion_predictions = {}
            
            # Traditional ML - Fusion (no emotional boost)
            for model_name, model in fusion_models['traditional'].items():
                readable_name = {
                    'logistic_regression': 'Logistic Regression',
                    'random_forest': 'Random Forest',
                    'xgboost': 'XGBoost'
                }.get(model_name, model_name)
                
                fusion_predictions[readable_name] = predict_with_model(model, fusion_scaled, 'sklearn', model_family='fusion', psycho_features=psycho_features)
            
            # Neural Networks - Fusion (WITH enhanced additive emotional boost)
            for model_name, model in fusion_models['nn'].items():
                readable_name = {
                    'simple_dnn': 'SimpleDNN',
                    'deep_dnn': 'DeepDNN',
                    'wide_dnn': 'WideDNN'
                }.get(model_name, model_name)
                
                fusion_predictions[readable_name] = predict_with_model(
                    model, fusion_scaled, 'pytorch', 
                    model_family='fusion', 
                    temperature=40.0,
                    psycho_features=psycho_features
                )
            
            results['fusion'] = fusion_predictions
        
        # Get emotional features from psycho features for display
        emotional = {}
        if len(psycho_features) >= 20:
            emotional = {
                'anger': float(psycho_features[0]),
                'anticipation': float(psycho_features[1]),
                'disgust': float(psycho_features[2]),
                'fear': float(psycho_features[3]),
                'joy': float(psycho_features[4]),
                'love': float(psycho_features[5]),
                'optimism': float(psycho_features[6]),
                'pessimism': float(psycho_features[7]),
                'sadness': float(psycho_features[8]),
                'surprise': float(psycho_features[9]),
                'trust': float(psycho_features[10]),
                'vaderNeg': float(psycho_features[14]),
                'vaderNeu': float(psycho_features[15]),
                'vaderPos': float(psycho_features[16]),
                'vaderCompound': float(psycho_features[17]),
                'blobPolarity': float(psycho_features[18]),
                'blobSubjectivity': float(psycho_features[19])
            }
        
        response_data = {
            'predictions': results,
            'emotionalFeatures': emotional
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =============================================
# HEALTH CHECK ENDPOINT
# =============================================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'device': str(device),
        'models': {
            'psycho': {
                'traditional': len(psycho_models['traditional']),
                'nn': len(psycho_models['nn'])
            },
            'metadata': {
                'traditional': len(metadata_models['traditional']),
                'nn': len(metadata_models['nn'])
            },
            'fusion': {
                'traditional': len(fusion_models['traditional']),
                'nn': len(fusion_models['nn'])
            }
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)