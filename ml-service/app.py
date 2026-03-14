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
        
        # Local path where model is saved
        local_model_path = "deberta_emotion_model"
        
        try:
            # Try to load from local first
            if os.path.exists(local_model_path):
                print(f"📂 Loading from local path: {local_model_path}")
                self.tokenizer = AutoTokenizer.from_pretrained(local_model_path)
                self.model = AutoModelForSequenceClassification.from_pretrained(local_model_path)
                print("✅ DeBERTa model loaded from local storage")
            else:
                # Download from Hugging Face
                print("🌐 Downloading from Hugging Face Hub...")
                model_name = "ayoubkirouane/BERT-Emotions-Classifier"
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
                
                # Save locally for next time
                print(f"💾 Saving to {local_model_path} for future use...")
                os.makedirs(local_model_path, exist_ok=True)
                self.tokenizer.save_pretrained(local_model_path)
                self.model.save_pretrained(local_model_path)
                print("✅ Model cached locally")
                
        except Exception as e:
            print(f"❌ Error loading DeBERTa model: {e}")
            raise
        
        self.model.to(device)
        self.model.eval()
        
        self.emotion_labels = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 
                               'love', 'optimism', 'pessimism', 'sadness', 'surprise', 'trust']
        
        print(f"✅ DeBERTa emotion model ready with {len(self.emotion_labels)} emotions")
    
    def extract_emotions(self, text):
        """Extract emotion probabilities using DeBERTa"""
        if not text or len(text.strip()) == 0:
            text = "No content"
        
        # Tokenize
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, 
                                max_length=512, padding=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        # Get predictions
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)[0].cpu().numpy()
        
        # Return as dictionary
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
        
        # Initialize DeBERTa emotion extractor
        self.deberta = DebertaEmotionExtractor(device)
    
    def extract_all_features(self, email_data):
        """Extract ALL 40 features using DeBERTa for emotions"""
        features = []
        
        # 0: attachments (index 0)
        features.append(email_data.get('attachmentCount', 0))
        
        # Get email content
        content = email_data.get('body', '')
        
        # 1-20: Emotional features from DeBERTa (20 features)
        # DeBERTa gives us 11 emotions, plus we need 9 more from VADER/TextBlob
        
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
        
        # Combine all emotional features in the exact order
        emotional_features = [
            deberta_emotions.get('anger', 0.0),        # anger
            deberta_emotions.get('anticipation', 0.0), # anticipation
            deberta_emotions.get('disgust', 0.0),      # disgust
            deberta_emotions.get('fear', 0.0),         # fear
            deberta_emotions.get('joy', 0.0),          # joy
            deberta_emotions.get('love', 0.0),         # love
            deberta_emotions.get('optimism', 0.0),     # optimism
            deberta_emotions.get('pessimism', 0.0),    # pessimism
            deberta_emotions.get('sadness', 0.0),      # sadness
            deberta_emotions.get('surprise', 0.0),     # surprise
            deberta_emotions.get('trust', 0.0),        # trust
            deberta_emotions.get('negative', vader_neg),  # negative
            deberta_emotions.get('neutral', vader_neu),   # neutral
            deberta_emotions.get('positive', vader_pos),  # positive
            vader_neg,                                   # vader_neg
            vader_neu,                                   # vader_neu
            vader_pos,                                   # vader_pos
            vader_compound,                              # vader_compound
            blob_polarity,                               # blob_polarity
            blob_subjectivity                            # blob_subjectivity
        ]
        
        features.extend(emotional_features)
        
        # 21-26: Recipient features (6)
        features.extend([
            email_data.get('toCount', 0),           # to_count
            email_data.get('externalTo', 0),        # external_to
            email_data.get('ccCount', 0),           # cc_count
            email_data.get('externalCc', 0),        # external_cc
            email_data.get('totalRecipients', 0),   # total_recipients
            email_data.get('externalRatio', 0)      # external_ratio
        ])
        
        # 27-34: Temporal features (8)
        features.extend([
            email_data.get('hour', 12),              # hour
            email_data.get('minute', 0),             # minute
            email_data.get('dayOfWeek', 0),          # day_of_week
            email_data.get('month', 1),              # month
            email_data.get('isWorkHour', 1),         # is_work_hour
            email_data.get('isAfterHours', 0),       # is_after_hours
            email_data.get('isWeekend', 0)           # is_weekend
        ])
        
        # 35-37: Attachment features (3)
        features.extend([
            email_data.get('attachmentCount', 0),    # attachment_count
            email_data.get('hasAttachment', 0),      # has_attachment
            email_data.get('sizeKb', 0)              # size_kb
        ])
        
        # 38: size_log
        features.append(email_data.get('sizeLog', 0))
        
        # 39-40: User/PC encoding (2)
        features.extend([0, 0])  # user_encoded, pc_encoded
        
        return features

# =============================================
# LOAD MODELS
# =============================================

print("=" * 50)
print("Loading ML models...")
print("=" * 50)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")

INPUT_SIZE = 40
models = {}
model_status = {}

# Load Scaler
try:
    scaler = joblib.load('models/scaler.pkl')
    model_status['scaler'] = 'loaded'
    print("✅ Scaler loaded")
except Exception as e:
    print(f"❌ Failed to load scaler: {e}")
    raise

# Load Traditional ML Models
traditional_models = [
    ('lr', 'logistic_regression.pkl', 'Logistic Regression'),
    ('rf', 'random_forest.pkl', 'Random Forest'),
    ('xgb', 'xgboost.pkl', 'XGBoost')
]

for key, filename, name in traditional_models:
    try:
        path = f'models/{filename}'
        if not os.path.exists(path):
            raise FileNotFoundError(f"{name} file not found")
        
        print(f"Loading {name} from {path}...")
        model = joblib.load(path)
        
        if hasattr(model, 'predict_proba'):
            models[key] = model
            print(f"✅ {name} loaded")
        else:
            raise ValueError(f"{name} missing predict_proba")
        
        model_status[key] = 'loaded'
    except Exception as e:
        print(f"❌ Failed to load {name}: {e}")
        raise

# Load DNN Models
dnn_models = [
    ('simple', 'simple_dnn.pth', 'SimpleDNN', SimpleDNN),
    ('deep', 'deep_dnn.pth', 'DeepDNN', DeepDNN),
    ('wide', 'wide_dnn.pth', 'WideDNN', WideDNN)
]

for key, filename, name, ModelClass in dnn_models:
    try:
        path = f'models/{filename}'
        if not os.path.exists(path):
            raise FileNotFoundError(f"{name} file not found")
        
        model = ModelClass(INPUT_SIZE).to(device)
        checkpoint = torch.load(path, map_location=device, weights_only=False)
        
        if 'model_state_dict' in checkpoint:
            state_dict = checkpoint['model_state_dict']
        else:
            state_dict = checkpoint
            
        model.load_state_dict(state_dict)
        model.eval()
        models[key] = model
        model_status[key] = 'loaded'
        print(f"✅ {name} loaded")
    except Exception as e:
        print(f"❌ Failed to load {name}: {e}")
        raise

# Initialize feature extractor with DeBERTa
feature_extractor = EmailFeatureExtractor(device)

print("\n✅ ALL MODELS LOADED SUCCESSFULLY")
print(f"Model status: {model_status}")

# =============================================
# PREDICTION FUNCTION
# =============================================

def get_risk_level(prob):
    if prob < 0.3: return 'LOW'
    elif prob < 0.7: return 'MEDIUM'
    else: return 'HIGH'

def predict_with_model(model, features_scaled, model_type='sklearn', temperature=1.0):
    """
    Get prediction from a model with temperature scaling for DNNs
    temperature > 1 makes probabilities softer (less extreme)
    """
    try:
        if model_type == 'sklearn':
            prob = model.predict_proba(features_scaled)[0][1]
        else:
            with torch.no_grad():
                features_tensor = torch.FloatTensor(features_scaled).to(device)
                outputs = model(features_tensor)
                
                # Apply temperature scaling to logits
                scaled_outputs = outputs / temperature
                probs = torch.softmax(scaled_outputs, dim=1)
                prob = probs[0][1].item()
                
                # Debug - uncomment to see raw vs scaled
                # if prob < 0.01:
                #     print(f"Raw logits: {outputs.cpu().numpy()}")
                #     print(f"After temperature {temperature}: {probs.cpu().numpy()}")
        
        return {
            'probability': float(prob),
            'isThreat': bool(prob > 0.5),
            'riskLevel': str(get_risk_level(prob))
        }
    except Exception as e:
        print(f"Prediction error: {e}")
        raise

def calculate_emotion_override(emotional_features, base_threat):
    """
    Calculate if emotion override should be applied and by how much
    """
    anger = emotional_features['anger']
    fear = emotional_features['fear']
    sadness = emotional_features['sadness']
    vader = emotional_features['vaderCompound']
    negative = emotional_features['negative']
    
    # Multiple trigger conditions
    triggers = []
    boost_amount = 0.0
    
    # Condition 1: High anger/fear
    if anger > 0.15 or fear > 0.15:
        triggers.append("high_negative_emotion")
        boost_amount += 0.15
    
    # Condition 2: Very negative sentiment
    if vader < -0.4:
        triggers.append("very_negative_sentiment")
        boost_amount += 0.2
    
    # Condition 3: High negative score
    if negative > 0.3:
        triggers.append("high_negative_score")
        boost_amount += 0.1
    
    # Condition 4: Combination of emotions
    if (anger + fear + sadness) > 0.3:
        triggers.append("emotional_distress")
        boost_amount += 0.1
    
    # Condition 5: Extremely negative combo
    if vader < -0.3 and (anger > 0.1 or fear > 0.1):
        triggers.append("angry_negative")
        boost_amount += 0.2
    
    # Cap the boost
    boost_amount = min(0.5, boost_amount)
    
    # Determine if models are under-predicting
    models_under_predicting = base_threat < 0.3 and len(triggers) > 0
    
    return models_under_predicting, boost_amount, triggers

# =============================================
# API ENDPOINT
# =============================================

@app.route('/predict-all', methods=['POST'])
def predict_all():
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
        
        # Extract features
        features_array = feature_extractor.extract_all_features(email_data)
        
        # Verify we have 40 features
        if len(features_array) != 40:
            print(f"WARNING: Expected 40 features, got {len(features_array)}")
            while len(features_array) < 40:
                features_array.append(0.0)
        
        # Scale features
        features_scaled = scaler.transform([features_array])
        
        # Extract emotional features for override calculation
        emotional = {
            'anger': float(features_array[1]),
            'fear': float(features_array[4]),
            'sadness': float(features_array[9]),
            'vaderCompound': float(features_array[18]),
            'negative': float(features_array[12])
        }
        
        # Get predictions from all models
        predictions = {}
        
        # Traditional ML models (no temperature needed)
        if 'lr' in models:
            lr_pred = predict_with_model(models['lr'], features_scaled, 'sklearn')
            predictions['logisticRegression'] = lr_pred
        if 'rf' in models:
            rf_pred = predict_with_model(models['rf'], features_scaled, 'sklearn')
            predictions['randomForest'] = rf_pred
        if 'xgb' in models:
            xgb_pred = predict_with_model(models['xgb'], features_scaled, 'sklearn')
            predictions['xgboost'] = xgb_pred
        
        # DNN models with temperature scaling
        dnn_predictions = []
        if 'simple' in models:
            simple_pred = predict_with_model(models['simple'], features_scaled, 'pytorch', temperature=3.0)
            predictions['simpleDNN'] = simple_pred
            dnn_predictions.append(simple_pred['probability'])
        if 'deep' in models:
            deep_pred = predict_with_model(models['deep'], features_scaled, 'pytorch', temperature=5.0)
            predictions['deepDNN'] = deep_pred
            dnn_predictions.append(deep_pred['probability'])
        if 'wide' in models:
            wide_pred = predict_with_model(models['wide'], features_scaled, 'pytorch', temperature=3.5)
            predictions['wideDNN'] = wide_pred
            dnn_predictions.append(wide_pred['probability'])
        
        # Calculate base ensemble from traditional models (more reliable)
        traditional_probs = [
            predictions['logisticRegression']['probability'],
            predictions['randomForest']['probability'],
            predictions['xgboost']['probability']
        ]
        base_threat = sum(traditional_probs) / len(traditional_probs)
        
        # EMOTION-BASED OVERRIDE
        models_under_predicting, boost_amount, triggers = calculate_emotion_override(emotional, base_threat)
        
        # Calculate final threat probability
        if models_under_predicting:
            # Boost the probability based on emotional content
            final_threat = min(0.95, base_threat + boost_amount)
            # print(f"EMOTION OVERRIDE TRIGGERED: {triggers} | Base={base_threat:.3f}, Boost={boost_amount:.3f}, Final={final_threat:.3f}")
        else:
            # Use normal ensemble with DNN contribution
            dnn_avg = sum(dnn_predictions) / len(dnn_predictions) if dnn_predictions else 0
            # Weight: 60% traditional, 40% DNNs
            final_threat = base_threat * 0.6 + dnn_avg * 0.4
        
        # Apply final threshold
        is_threat = final_threat > 0.35  # Lower threshold for emotion-triggered emails
        risk_level = get_risk_level(final_threat)
        
        # Override individual predictions for consistency
        for model_name in predictions:
            predictions[model_name]['probability'] = float(final_threat)
            predictions[model_name]['isThreat'] = bool(is_threat)
            predictions[model_name]['riskLevel'] = str(risk_level)
        
        # Get emotional features for frontend
        emotional_features = {
            'anger': float(features_array[1]),
            'anticipation': float(features_array[2]),
            'disgust': float(features_array[3]),
            'fear': float(features_array[4]),
            'joy': float(features_array[5]),
            'love': float(features_array[6]),
            'optimism': float(features_array[7]),
            'pessimism': float(features_array[8]),
            'sadness': float(features_array[9]),
            'surprise': float(features_array[10]),
            'trust': float(features_array[11]),
            'negative': float(features_array[12]),
            'neutral': float(features_array[13]),
            'positive': float(features_array[14]),
            'vaderNeg': float(features_array[15]),
            'vaderNeu': float(features_array[16]),
            'vaderPos': float(features_array[17]),
            'vaderCompound': float(features_array[18]),
            'blobPolarity': float(features_array[19]),
            'blobSubjectivity': float(features_array[20])
        }
        
        response_data = {
            'predictions': predictions,
            'emotionalFeatures': emotional_features,
            'metadata': {
                'emotion_override': models_under_predicting,
                'emotion_threat_score': float(sum([emotional['anger'], emotional['fear'], emotional['sadness']])),
                'base_threat': float(base_threat),
                'triggers': triggers
            }
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'models': model_status,
        'device': str(device),
        'input_size': INPUT_SIZE
    })

@app.route('/debug-email', methods=['POST'])
def debug_email():
    """Test a specific email and see what features and predictions it generates"""
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
        
        # Extract features
        features_array = feature_extractor.extract_all_features(email_data)
        
        # Scale features
        features_scaled = scaler.transform([features_array])
        
        # Get all predictions
        results = {}
        for name, model_obj in models.items():
            if name in ['lr', 'rf', 'xgb']:
                pred = predict_with_model(model_obj, features_scaled, 'sklearn')
            else:
                # Use appropriate temperature for each DNN
                if name == 'simple':
                    pred = predict_with_model(model_obj, features_scaled, 'pytorch', temperature=3.0)
                elif name == 'deep':
                    pred = predict_with_model(model_obj, features_scaled, 'pytorch', temperature=5.0)
                else:  # wide
                    pred = predict_with_model(model_obj, features_scaled, 'pytorch', temperature=3.5)
            results[name] = pred
        
        # Get top emotional features
        emotional = {
            'anger': float(features_array[1]),
            'fear': float(features_array[4]),
            'sadness': float(features_array[9]),
            'vader_compound': float(features_array[18])
        }
        
        return jsonify({
            'features': {
                'external_ratio': float(features_array[26]),
                'is_after_hours': float(features_array[33]),
                'attachment_count': float(features_array[35]),
                'size_kb': float(features_array[37]),
                'emotional': emotional
            },
            'predictions': results
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)